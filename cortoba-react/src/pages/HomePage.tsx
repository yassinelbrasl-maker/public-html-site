import { HeroSlider } from "@/components/HeroSlider";
import { ProjectsSection } from "@/components/ProjectsSection";
import { ServicesSection } from "@/components/ServicesSection";
import { ConfiguratorTeaser } from "@/components/ConfiguratorTeaser";
import { AboutSection } from "@/components/AboutSection";
import { TeamSection } from "@/components/TeamSection";
import { ContactSection } from "@/components/ContactSection";
import { MapSection } from "@/components/MapSection";
import { Seo } from "@/seo/Seo";

export function HomePage() {
  return (
    <>
      <Seo
        title=""
        description="Cortoba Architecture Studio — studio d'architecture basé à Djerba. Conception, design intérieur, suivi de chantier. Des projets qui racontent le lieu, la lumière et les gestes du quotidien."
        keywords="architecte Djerba, architecture Tunisie, studio d'architecture, Cortoba, conception architecturale, villa contemporaine, HQE"
        url="/"
      />
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
