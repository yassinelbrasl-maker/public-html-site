import { HeroSlider } from "@/components/HeroSlider";
import { ProjectsSection } from "@/components/ProjectsSection";
import { ServicesSection } from "@/components/ServicesSection";
import { ConfiguratorTeaser } from "@/components/ConfiguratorTeaser";

export function HomePage() {
  return (
    <>
      <HeroSlider />
      <ProjectsSection />
      <ServicesSection />
      <ConfiguratorTeaser />
      {/* TODO — sections à porter :
          <AboutSection />
          <TeamSection />
          <ContactSection />
          <MapSection />
      */}
    </>
  );
}
