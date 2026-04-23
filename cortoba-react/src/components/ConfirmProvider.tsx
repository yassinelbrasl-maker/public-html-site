import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { Modal } from "./Modal";

interface ConfirmOptions {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const Ctx = createContext<ConfirmFn | null>(null);

/**
 * Provider global pour dialogues de confirmation. Remplace window.confirm().
 * Usage :
 *   const confirm = useConfirm();
 *   const ok = await confirm({ message: "Supprimer ?", tone: "danger" });
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    open: boolean;
    opts: ConfirmOptions;
  }>({
    open: false,
    opts: { message: "" },
  });
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setState({ open: true, opts });
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  function close(result: boolean) {
    setState((s) => ({ ...s, open: false }));
    resolverRef.current?.(result);
    resolverRef.current = null;
  }

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Modal
        open={state.open}
        onClose={() => close(false)}
        size="sm"
        title={state.opts.title || "Confirmer"}
        footer={
          <>
            <button
              type="button"
              onClick={() => close(false)}
              className="cta-button text-xs"
            >
              {state.opts.cancelLabel || "Annuler"}
            </button>
            <button
              type="button"
              onClick={() => close(true)}
              className={`cta-button text-xs cta-button-primary ${
                state.opts.tone === "danger"
                  ? "!bg-red-500 !border-red-500 hover:!bg-red-600"
                  : ""
              }`}
            >
              {state.opts.confirmLabel || "Confirmer"}
            </button>
          </>
        }
      >
        <div className="text-sm text-fg leading-relaxed">
          {state.opts.message}
        </div>
      </Modal>
    </Ctx.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const fn = useContext(Ctx);
  if (!fn) throw new Error("useConfirm must be used within ConfirmProvider");
  return fn;
}
