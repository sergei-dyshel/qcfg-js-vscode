import { mapEntries, omit } from "@sergei-dyshel/typescript/object";
import { zod, zodToJsonSchema } from "@sergei-dyshel/typescript/zod";
import {
  workspace,
  type ConfigurationChangeEvent,
  type ConfigurationScope,
  type ConfigurationTarget,
} from "vscode";

interface PropertySpec<S extends zod.ZodTypeAny = zod.ZodTypeAny> {
  schema: S;
  description?: string;
  markdownDescription?: string;
  scope?: "application" | "machine";
}

interface SectionSpec {
  title: string;
  properties: Record<string, PropertySpec>;
}

export type ConfigSpec = Record<string, PropertySpec | SectionSpec>;

type Section<S extends SectionSpec = SectionSpec> = {
  [K in keyof S["properties"]]: Property<S["properties"][K]["schema"]>;
};

type Config<S extends ConfigSpec = ConfigSpec> = {
  [K in keyof S]: S[K] extends PropertySpec
    ? Property<S[K]["schema"]>
    : S[K] extends SectionSpec
      ? Section<S[K]>
      : never;
};

function defineSection<S extends SectionSpec>(prefix: string, sectionName: string, spec: S) {
  return Object.fromEntries(
    Object.entries(spec.properties).map(([name, prop]) => [
      name,
      new Property([prefix, sectionName, name].join("."), prop),
    ]),
  ) as Section<S>;
}

export function define<S extends ConfigSpec>(prefix: string, spec: S) {
  return Object.fromEntries(
    Object.entries(spec).map(([name, propSection]) => [
      name,
      "schema" in propSection
        ? new Property([prefix, name].join("."), propSection as PropertySpec)
        : defineSection(prefix, name, propSection),
    ]),
  ) as Config<S>;
}

export function generateManifest(extDisplayName: string, prefix: string, spec: ConfigSpec): any {
  const mainProperties: Record<string, PropertySpec> = {};
  const sections: [prefix: string, spec: SectionSpec][] = [];
  for (const name in spec) {
    const value = spec[name];
    if ("schema" in value) mainProperties[name] = value;
    else sections.push([prefix + "." + name, value]);
  }
  sections.unshift([prefix, { title: extDisplayName, properties: mainProperties }]);
  return sections.map(([prefix, sectionSpec]) => generateSectionManifest(prefix, sectionSpec));
}

export function boolean(defaultValue: boolean) {
  return zod.boolean().default(defaultValue);
}

export const confirmSchema = zod.enum(["always", "never", "ask"]).default("ask");

export function confirm(description: string): PropertySpec<typeof confirmSchema> {
  return {
    schema: confirmSchema,
    description,
    scope: "application",
  } as PropertySpec<typeof confirmSchema>;
}

function generateSectionManifest(prefix: string, sectionSpec: SectionSpec) {
  return {
    title: sectionSpec.title,
    properties: mapEntries(
      sectionSpec.properties,
      (name, propSpec) => [prefix + "." + name, generatePropertyManifest(propSpec)] as const,
    ),
  };
}

function generatePropertyManifest(property: PropertySpec) {
  return {
    ...omit(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      zodToJsonSchema(property.schema, {
        $refStrategy: "none",
      }),
      "$schema",
    ),
    ...omit(property, "schema"),
  };
}

type ValueTypeOrDefault<V extends zod.ZodTypeAny> =
  V extends zod.ZodDefault<zod.ZodTypeAny> ? zod.infer<V> : zod.infer<V> | undefined;

export class Property<S extends zod.ZodTypeAny = zod.ZodTypeAny> {
  constructor(
    public key: string,
    public spec: PropertySpec<S>,
  ) {}

  get schema() {
    return this.spec.schema;
  }

  /** Retrieve value (see {@link WorkspaceConfiguration.get}) */
  get(scope?: ConfigurationScope) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.spec.schema.parse(
      workspace.getConfiguration().get(this.key, scope),
    ) as ValueTypeOrDefault<S>;
  }

  /** Update value (see {@link WorkspaceConfiguration.update}) */
  async update(value: zod.infer<S>, configurationTarget?: ConfigurationTarget | boolean | null) {
    return workspace.getConfiguration().update(this.key, value, configurationTarget);
  }

  /** Remove value (see {@link WorkspaceConfiguration.update}) */
  async reset(configurationTarget?: ConfigurationTarget | boolean | null) {
    return workspace.getConfiguration().update(this.key, undefined, configurationTarget);
  }

  onDidChange(
    callback: (newValue: ValueTypeOrDefault<S>) => void,
    options?: { scope?: ConfigurationScope; initial?: boolean },
  ) {
    if (options?.initial) callback(this.get(options.scope));
    return workspace.onDidChangeConfiguration((event: ConfigurationChangeEvent) => {
      if (event.affectsConfiguration(this.key, options?.scope)) {
        callback(this.get(options?.scope));
      }
    });
  }
}
