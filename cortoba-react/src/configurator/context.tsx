import {
  createContext,
  useContext,
  useReducer,
  useState,
  ReactNode,
  useCallback,
} from "react";
import {
  reducer,
  initialState,
  ConfiguratorState,
  Action,
  StepKey,
} from "./state";
import { validateStep } from "./validation";

interface ConfiguratorContextValue {
  state: ConfiguratorState;
  dispatch: (a: Action) => void;
  step: StepKey;
  goTo: (next: StepKey) => string | null; // returns error message or null on success
  direction: number; // +1 forward, -1 backward (used by AnimatePresence)
  error: string | null;
  setError: (msg: string | null) => void;
}

const Ctx = createContext<ConfiguratorContextValue | null>(null);

export function ConfiguratorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [step, setStep] = useState<StepKey>(1);
  const [direction, setDirection] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);

  const goTo = useCallback(
    (next: StepKey): string | null => {
      // Validation only applies when moving forward in the numbered sequence
      const isForward =
        typeof next === "number" && typeof step === "number" && next > step;
      if (isForward) {
        const err = validateStep(step as 1 | 2 | 3 | 4 | 5 | 6, state);
        if (err) {
          setError(err);
          return err;
        }
      }
      setError(null);
      setDirection(isForward ? 1 : -1);
      setStep(next);
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return null;
    },
    [step, state]
  );

  return (
    <Ctx.Provider
      value={{ state, dispatch, step, goTo, direction, error, setError }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useConfigurator() {
  const v = useContext(Ctx);
  if (!v)
    throw new Error("useConfigurator must be used within ConfiguratorProvider");
  return v;
}
