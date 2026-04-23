import { Helmet } from "react-helmet-async";

interface Props {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: "website" | "article";
  keywords?: string;
  /** If true, tell crawlers not to index this route (admin pages). */
  noIndex?: boolean;
}

const DEFAULT_TITLE = "Cortoba Architecture Studio";
const DEFAULT_DESCRIPTION =
  "Cortoba Architecture Studio — des projets qui racontent le lieu, la lumière et les gestes du quotidien.";
const DEFAULT_IMAGE = "/img/og-default.jpg"; // fallback; individual pages override
const SITE_URL = "https://cortobaarchitecture.com";

/**
 * SEO — balises meta par route (Helmet injecte dans <head> client-side).
 *
 * ⚠️ Note : en mode SPA pur, ces meta ne sont vues que par les crawlers qui
 * exécutent JS (Googlebot). Pour Bing / LinkedIn / WhatsApp preview, il faut
 * un rendu statique au build (voir deploy/SSR.md).
 */
export function Seo({
  title,
  description = DEFAULT_DESCRIPTION,
  image = DEFAULT_IMAGE,
  url,
  type = "website",
  keywords,
  noIndex,
}: Props) {
  const fullTitle = title ? `${title} — ${DEFAULT_TITLE}` : DEFAULT_TITLE;
  const absoluteUrl = url
    ? url.startsWith("http")
      ? url
      : `${SITE_URL}${url.startsWith("/") ? url : `/${url}`}`
    : SITE_URL;
  const absoluteImage = image.startsWith("http") ? image : `${SITE_URL}${image}`;

  return (
    <Helmet prioritizeSeoTags>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {keywords && <meta name="keywords" content={keywords} />}
      {noIndex && <meta name="robots" content="noindex,nofollow" />}

      <link rel="canonical" href={absoluteUrl} />

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={absoluteImage} />
      <meta property="og:url" content={absoluteUrl} />
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={DEFAULT_TITLE} />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={absoluteImage} />
    </Helmet>
  );
}
