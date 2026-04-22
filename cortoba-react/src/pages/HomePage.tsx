import { HeroSlider } from "@/components/HeroSlider";
import { ProjectsSection } from "@/components/ProjectsSection";
import { ServicesSection } from "@/components/ServicesSection";
import { ConfiguratorTeaser } from "@/components/ConfiguratorTeaser";
import { AboutSection } from "@/components/AboutSection";
import { TeamSection } from "@/components/TeamSection";
import { ContactSection } from "@/components/ContactSection";
import { MapSection } from "@/components/MapSection";

export function HomePage() {
  return (
    <>
      <HeroSlider />
      <ProjectsSection />
      <ServicesSection />
      <ConfiguratorTeaser />
      <AboutSection />
      <TeamSection />
      <ContactSection />
      <MapSection />
    </>
  );
}
