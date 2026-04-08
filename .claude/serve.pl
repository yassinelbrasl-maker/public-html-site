#!/usr/bin/perl
# Tiny static file server for preview. Usage: perl serve.pl <port> <docroot>
use strict; use warnings;
use IO::Socket::INET;
use IO::Select;
use File::Spec;

my $port    = $ARGV[0] || 8080;
my $docroot = $ARGV[1] || '.';
$docroot = File::Spec->rel2abs($docroot);

my %mime = (
    html=>'text/html; charset=utf-8', htm=>'text/html; charset=utf-8',
    js=>'application/javascript; charset=utf-8',
    css=>'text/css; charset=utf-8',
    json=>'application/json; charset=utf-8',
    png=>'image/png', jpg=>'image/jpeg', jpeg=>'image/jpeg', gif=>'image/gif',
    svg=>'image/svg+xml', ico=>'image/x-icon',
    woff=>'font/woff', woff2=>'font/woff2', ttf=>'font/ttf',
    pdf=>'application/pdf', txt=>'text/plain; charset=utf-8',
);

$| = 1;
my $srv = IO::Socket::INET->new(LocalAddr=>'127.0.0.1', LocalPort=>$port, Proto=>'tcp', Listen=>50, ReuseAddr=>1)
    or die "Cannot bind to port $port: $!";
$srv->blocking(0);
my $sel = IO::Select->new($srv);
print "Listening on http://127.0.0.1:$port (root: $docroot)\n";

sub send_response {
    my ($c, $status, $type, $body) = @_;
    my $len = length($body);
    print $c "HTTP/1.1 $status\r\nContent-Type: $type\r\nContent-Length: $len\r\nConnection: close\r\nCache-Control: no-cache\r\n\r\n$body";
}

while (1) {
    my @ready = $sel->can_read(0.5);
    for my $fh (@ready) {
        if ($fh == $srv) {
            my $c = $srv->accept() or next;
            $c->blocking(1);
            # Read with timeout
            my $req = '';
            eval {
                local $SIG{ALRM} = sub { die "timeout\n"; };
                alarm(2);
                while (my $line = <$c>) { $req .= $line; last if $line =~ /^\r?\n$/; }
                alarm(0);
            };
            if (!$req || $req !~ m{^GET\s+(\S+)\s+HTTP}) {
                send_response($c, '400 Bad Request', 'text/plain', 'bad');
                close($c); next;
            }
            my $path = $1;
            $path =~ s/\?.*$//;
            $path = '/plateforme-nas.html' if $path eq '/';
            $path =~ s|//+|/|g;
            my $fs = File::Spec->catfile($docroot, $path);
            $fs =~ s|\\|/|g;
            if (-d $fs) { $fs .= '/index.html'; }
            if (-e $fs && -f $fs) {
                my ($ext) = $fs =~ /\.([^.]+)$/;
                $ext = lc($ext||'');
                my $type = $mime{$ext} || 'application/octet-stream';
                open(my $fhh, '<:raw', $fs) or do {
                    send_response($c, '500 Internal Server Error', 'text/plain', 'err');
                    close($c); next;
                };
                local $/; my $body = <$fhh>; close($fhh);
                send_response($c, '200 OK', $type, $body);
                print "200 $path\n";
            } elsif ($path =~ /\.php$/) {
                # Stub PHP: empty envelope (no PHP runtime)
                send_response($c, '200 OK', 'application/json', '{"ok":true,"data":[]}');
                print "200 (stub) $path\n";
            } else {
                send_response($c, '404 Not Found', 'text/plain', "404 $path");
                print "404 $path\n";
            }
            close($c);
        }
    }
}
