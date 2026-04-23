import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ConfiguratorProvider, useConfigurator } from "@/configurator/context";
import { Stepper, StepIndicatorPill } from "@/configurator/Stepper";
import { Step1Projet } from "@/configurator/steps/Step1Projet";
import { Step3Fondations } from "@/configurator/steps/Step3Fondations";
import { Step4Identite } from "@/configurator/steps/Step4Identite";
import {
  Step2Missions,
  Step5Programme,
  Step6Terrain,
} from "@/configurator/steps/MiddleSteps";
import { StepClient } from "@/configurator/steps/StepClient";
import { StepSuccess } from "@/configurator/steps/StepSuccess";

/**
 * ConfiguratorPage — shell principal.
 * Option C : React détient le state, la navigation, les transitions.
 * framer-motion AnimatePresence avec mode="wait" = true cross-fade entre steps.
 * Chaque step est un composant isolé qui dispatche contre le store React.
 */
export function ConfiguratorPage() {
  return (
    <ConfiguratorProvider>
      <ConfiguratorShell />
    </ConfiguratorProvider>
  );
}

function ConfiguratorShell() {
  const [entered, setEntered] = useState(false);

  if (!entered) {
    return <IntroBanner onStart={() => setEntered(true)} />;
  }

  return (
    <div className="min-h-screen pt-24 pb-16">
      <Stepper />
      <StepIndicatorPill />
      <div className="max-w-3xl mx-auto px-6 mt-8">
        <StepRouter />
      </div>
    </div>
  );
}

function IntroBanner({ onStart }: { onStart: () => void }) {
  return (
    <section className="min-h-screen flex items-center justify-center px-6 text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 0.61, 0.36, 1] }}
        className="max-w-2xl"
      >
        <p className="text-xs tracking-[0.3em] uppercase text-gold mb-4">
          Outil exclusif
        </p>
        <h1 className="font-serif text-5xl md:text-7xl font-light leading-tight mb-6">
          Configurateur{" "}
          <em className="text-gold not-italic italic">de projet</em>
        </h1>
        <p className="text-fg-muted text-base leading-relaxed mb-10 max-w-xl mx-auto">
          Estimez la surface et le budget de votre futur projet en quelques clics. Notre
          moteur de calcul croise votre programme avec des ratios architecturaux pour vous
          donner une première fourchette réaliste.
        </p>
        <motion.button
          onClick={onStart}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="cta-button cta-button-primary text-base px-8 py-4"
        >
          ✦ Démarrer le configurateur →
        </motion.button>
      </motion.div>
    </section>
  );
}

function StepRouter() {
  const { step, direction } = useConfigurator();

  return (
    <AnimatePresence mode="wait" custom={direction}>
      <motion.div
        key={String(step)}
        custom={direction}
        initial={{ opacity: 0, x: direction * 30 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: direction * -30 }}
        transition={{ duration: 0.35, ease: [0.22, 0.61, 0.36, 1] }}
      >
        {step === 1 && <Step1Projet />}
        {step === 2 && <Step2Missions />}
        {step === 3 && <Step3Fondations />}
        {step === 4 && <Step4Identite />}
        {step === 5 && <Step5Programme />}
        {step === 6 && <Step6Terrain />}
        {step === "client" && <StepClient />}
        {step === "success" && <StepSuccess />}
      </motion.div>
    </AnimatePresence>
  );
}
