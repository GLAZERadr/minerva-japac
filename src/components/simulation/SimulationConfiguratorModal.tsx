"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@heroui/react";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useSimulation,
  type SimulationConfiguratorFormValues,
  type ProductFlowDefinition,
} from "./SimulationProvider";

type GeneralFieldKey = keyof SimulationConfiguratorFormValues["general"];
type ParameterFieldKey = keyof SimulationConfiguratorFormValues["parameters"];

type FieldDescriptor<Key extends string> = {
  key: Key;
  label: string;
  placeholder?: string;
};

const generalFieldDescriptors: FieldDescriptor<GeneralFieldKey>[] = [
  { key: "lot", label: "Lot", placeholder: "e.g. LOT-6061" },
  { key: "derivative", label: "Derivative", placeholder: "e.g. Round" },
  { key: "diameter", label: "Diameter", placeholder: "e.g. 6 inch" },
  { key: "moltenState", label: "Molten State", placeholder: "e.g. Liquid" },
  {
    key: "materialMix",
    label: "Material Mix",
    placeholder: "e.g. Primary Ingot",
  },
  { key: "series", label: "Series", placeholder: "e.g. 6000" },
];

const parameterFieldDescriptors: FieldDescriptor<ParameterFieldKey>[] = [
  { key: "temperature", label: "Temperature", placeholder: "e.g. 730°C" },
  { key: "altitude", label: "Altitude", placeholder: "e.g. 25 m" },
  { key: "castingSpeed", label: "Casting Speed", placeholder: "e.g. 15 m/min" },
  {
    key: "argonPressure",
    label: "Argon Pressure",
    placeholder: "e.g. 2.5 bar",
  },
  { key: "waterPump", label: "Water Pump", placeholder: "e.g. 80%" },
];

const createEmptyForm = (): SimulationConfiguratorFormValues => ({
  general: {
    lot: "",
    derivative: "",
    diameter: "",
    moltenState: "",
    materialMix: "",
    series: "",
  },
  parameters: {
    temperature: "",
    altitude: "",
    castingSpeed: "",
    argonPressure: "",
    waterPump: "",
  },
});

// Prefilled so a demo run produces a meaningful before/after report.
const DEFAULT_PARAMETERS: Record<ParameterFieldKey, string> = {
  temperature: "730 °C",
  altitude: "25 m",
  castingSpeed: "14 m/min",
  argonPressure: "2.5 bar",
  waterPump: "80%",
};

const readDefaultValue = (
  config: ProductFlowDefinition["defaultConfig"],
  key: string
) => {
  const value = config?.[key];
  return typeof value === "string" ? value : "";
};

function SimulationConfiguratorModal() {
  const {
    isConfiguratorOpen,
    closeConfigurator,
    submitConfiguration,
    productFlows,
    flowsLoading,
    flowsError,
    selectedProductId,
    lastConfiguration,
  } = useSimulation();

  const [productId, setProductId] = useState<string | null>(null);
  const [formValues, setFormValues] =
    useState<SimulationConfiguratorFormValues>(createEmptyForm);

  const selectedProduct = useMemo(() => {
    if (!productId) return null;
    return productFlows.find((item) => item.productId === productId) ?? null;
  }, [productFlows, productId]);

  const buildFormForProduct = useCallback(
    (
      product: ProductFlowDefinition | null
    ): SimulationConfiguratorFormValues => {
      if (!product) {
        return createEmptyForm();
      }
      const defaults = product.defaultConfig ?? {};
      const baseline =
        selectedProductId === product.productId && lastConfiguration
          ? lastConfiguration
          : null;

      const empty = createEmptyForm();
      const general = { ...empty.general };
      const parameters = { ...empty.parameters };

      generalFieldDescriptors.forEach((field) => {
        const baselineValue = baseline?.general?.[field.key];
        general[field.key] =
          typeof baselineValue === "string" && baselineValue.length > 0
            ? baselineValue
            : readDefaultValue(defaults, field.key);
      });

      parameterFieldDescriptors.forEach((field) => {
        const baselineValue = baseline?.parameters?.[field.key];
        parameters[field.key] =
          typeof baselineValue === "string" && baselineValue.length > 0
            ? baselineValue
            : readDefaultValue(defaults, field.key) || DEFAULT_PARAMETERS[field.key];
      });

      return {
        general,
        parameters,
      };
    },
    [lastConfiguration, selectedProductId]
  );

  useEffect(() => {
    if (!isConfiguratorOpen) {
      setProductId(null);
      setFormValues(createEmptyForm());
      return;
    }

    if (productFlows.length === 0) {
      setProductId(null);
      setFormValues(createEmptyForm());
      return;
    }

    setProductId((current) => {
      if (current && productFlows.some((flow) => flow.productId === current)) {
        return current;
      }
      if (
        selectedProductId &&
        productFlows.some((flow) => flow.productId === selectedProductId)
      ) {
        return selectedProductId;
      }
      return productFlows[0].productId;
    });
  }, [isConfiguratorOpen, productFlows, selectedProductId]);

  useEffect(() => {
    if (!isConfiguratorOpen) return;
    setFormValues(buildFormForProduct(selectedProduct));
  }, [buildFormForProduct, isConfiguratorOpen, selectedProduct]);

  const handleGeneralChange = useCallback(
    (key: GeneralFieldKey, value: string) => {
      setFormValues((prev) => ({
        general: { ...(prev.general ?? {}), [key]: value },
        parameters: { ...(prev.parameters ?? {}) },
      }));
    },
    []
  );

  const handleParameterChange = useCallback(
    (key: ParameterFieldKey, value: string) => {
      setFormValues((prev) => ({
        general: { ...(prev.general ?? {}) },
        parameters: { ...(prev.parameters ?? {}), [key]: value },
      }));
    },
    []
  );

  const handleSubmit = useCallback(() => {
    if (!productId || !selectedProduct) return;
    submitConfiguration(productId, formValues);
  }, [formValues, productId, selectedProduct, submitConfiguration]);

  const isSubmitDisabled = !selectedProduct || productFlows.length === 0;

  return (
    <Dialog
      open={isConfiguratorOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeConfigurator();
        }
      }}
    >
      <DialogContent
        style={{ fontFamily: "Roboto, system-ui, -apple-system, sans-serif" }}
        className="flex max-h-[min(90dvh,900px)] w-[calc(100vw-1.5rem)] max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#212121] p-0 text-[#e8eaed] shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
      >
        <DialogHeader className="shrink-0 border-b border-white/10 px-5 py-4 sm:px-6 sm:py-5">
          <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#9aa0a6]">
            Simulation setup
          </span>
          <DialogTitle className="mt-1 text-xl font-medium text-[#e8eaed]">
            Choose product & parameters
          </DialogTitle>
          {selectedProduct && (
            <DialogDescription className="mt-1 text-xs text-[#9aa0a6]">
              {selectedProduct.description}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="google-scroll min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          {flowsLoading && productFlows.length === 0 && (
            <p className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-4 text-sm text-[#bdc1c6]">
              Loading product flows…
            </p>
          )}

          {flowsError && (
            <p className="rounded-2xl border border-[rgba(242,139,130,0.35)] bg-[rgba(242,139,130,0.12)] p-4 text-sm text-[#f28b82]">
              {flowsError}
            </p>
          )}

          <section className="space-y-3">
            <h4 className="text-sm font-medium text-[#e8eaed]">Product</h4>
            {productFlows.length === 0 ? (
              <p className="rounded-2xl bg-white/5 p-4 text-sm text-[#9aa0a6]">
                No product flows available. The default sequence will be used.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {productFlows.map((product) => {
                  const isActive = productId === product.productId;
                  return (
                    <button
                      key={product.productId}
                      type="button"
                      onClick={() => setProductId(product.productId)}
                      className={`rounded-2xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8ab4f8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#212121] ${
                        isActive
                          ? "border-[#8ab4f8] bg-[rgba(138,180,248,0.12)] text-[#e8eaed]"
                          : "border-white/10 bg-white/5 text-[#bdc1c6] hover:border-[rgba(138,180,248,0.5)] hover:text-[#e8eaed]"
                      }`}
                    >
                      <p className="text-sm font-medium">
                        {product.productName}
                      </p>
                      <p className="mt-0.5 text-xs text-[#9aa0a6]">
                        {product.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-[#e8eaed]">
                General information
              </h4>
              <p className="mt-0.5 text-xs text-[#9aa0a6]">
                Lot and material context for the simulation.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {generalFieldDescriptors.map((field) => (
                <div key={field.key} className="space-y-2">
                  <label
                    htmlFor={`general-${field.key}`}
                    className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#9aa0a6]"
                  >
                    {field.label}
                  </label>
                  <Input
                    id={`general-${field.key}`}
                    placeholder={field.placeholder}
                    value={formValues.general?.[field.key] ?? ""}
                    onChange={(event) =>
                      handleGeneralChange(field.key, event.target.value)
                    }
                    className="border-white/10 bg-[#2b2b2b] text-[#e8eaed] placeholder:text-[#5f6368] focus-visible:ring-[#8ab4f8] focus-visible:ring-offset-[#212121]"
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-[#e8eaed]">
                Machine parameters
              </h4>
              <p className="mt-0.5 text-xs text-[#9aa0a6]">
                Process settings to test against current practice.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {parameterFieldDescriptors.map((field) => (
                <div key={field.key} className="space-y-2">
                  <label
                    htmlFor={`parameter-${field.key}`}
                    className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#9aa0a6]"
                  >
                    {field.label}
                  </label>
                  <Input
                    id={`parameter-${field.key}`}
                    placeholder={field.placeholder}
                    value={formValues.parameters?.[field.key] ?? ""}
                    onChange={(event) =>
                      handleParameterChange(field.key, event.target.value)
                    }
                    className="border-white/10 bg-[#2b2b2b] text-[#e8eaed] placeholder:text-[#5f6368] focus-visible:ring-[#8ab4f8] focus-visible:ring-offset-[#212121]"
                  />
                </div>
              ))}
            </div>
          </section>
        </div>
        <DialogFooter className="shrink-0 border-t border-white/10 px-5 py-3 sm:px-6 sm:py-4">
          <Button
            variant="flat"
            color="default"
            className="rounded-full bg-white/8 px-5 text-[#e8eaed]"
            onPress={closeConfigurator}
          >
            Cancel
          </Button>
          <Button
            color="primary"
            className="rounded-full bg-[#8ab4f8] px-5 font-medium text-[#062e6f]"
            isDisabled={isSubmitDisabled}
            onPress={handleSubmit}
          >
            Start simulation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SimulationConfiguratorModal;
