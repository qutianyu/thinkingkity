import { JSON_DOC_TYPES } from "@/json";

export interface CodeType {
  exts: string[];
  labelKey: string;
  titleKey: string;
  descKey: string;
}

export const CODE_TYPES: CodeType[] = [
  { exts: ["ts", "tsx"], labelKey: "sidebar.newTypescript", titleKey: "dialog.newTypescriptTitle", descKey: "dialog.newTypescriptDescription" },
  { exts: ["js", "jsx"], labelKey: "sidebar.newJavascript", titleKey: "dialog.newJavascriptTitle", descKey: "dialog.newJavascriptDescription" },
  { exts: ["py"], labelKey: "sidebar.newPython", titleKey: "dialog.newPythonTitle", descKey: "dialog.newPythonDescription" },
  { exts: ["java"], labelKey: "sidebar.newJava", titleKey: "dialog.newJavaTitle", descKey: "dialog.newJavaDescription" },
  { exts: ["c", "h"], labelKey: "sidebar.newC", titleKey: "dialog.newCTitle", descKey: "dialog.newCDescription" },
  { exts: ["cpp", "hpp"], labelKey: "sidebar.newCpp", titleKey: "dialog.newCppTitle", descKey: "dialog.newCppDescription" },
  { exts: ["go"], labelKey: "sidebar.newGo", titleKey: "dialog.newGoTitle", descKey: "dialog.newGoDescription" },
  { exts: ["rs"], labelKey: "sidebar.newRust", titleKey: "dialog.newRustTitle", descKey: "dialog.newRustDescription" },
  { exts: ["css", "scss", "less"], labelKey: "sidebar.newCss", titleKey: "dialog.newCssTitle", descKey: "dialog.newCssDescription" },
  { exts: ["html", "htm"], labelKey: "sidebar.newHtml", titleKey: "dialog.newHtmlTitle", descKey: "dialog.newHtmlDescription" },
  { exts: ["xml"], labelKey: "sidebar.newXml", titleKey: "dialog.newXmlTitle", descKey: "dialog.newXmlDescription" },
  { exts: ["sql"], labelKey: "sidebar.newSql", titleKey: "dialog.newSqlTitle", descKey: "dialog.newSqlDescription" },
  { exts: ["sh", "bash", "zsh"], labelKey: "sidebar.newShell", titleKey: "dialog.newShellTitle", descKey: "dialog.newShellDescription" },
  { exts: ["vue"], labelKey: "sidebar.newVue", titleKey: "dialog.newVueTitle", descKey: "dialog.newVueDescription" },
  { exts: ["lua"], labelKey: "sidebar.newLua", titleKey: "dialog.newLuaTitle", descKey: "dialog.newLuaDescription" },
  { exts: ["r"], labelKey: "sidebar.newR", titleKey: "dialog.newRTitle", descKey: "dialog.newRDescription" },
  { exts: ["groovy"], labelKey: "sidebar.newGroovy", titleKey: "dialog.newGroovyTitle", descKey: "dialog.newGroovyDescription" },
];

export interface TypeChip {
  ext: string;
  labelKey: string;
  titleKey: string;
  descKey: string;
}

export function expandCodeTypes(): TypeChip[] {
  return CODE_TYPES.flatMap((ct) =>
    ct.exts.map((ext) => ({
      ext,
      labelKey: ct.labelKey,
      titleKey: ct.titleKey,
      descKey: ct.descKey,
    })),
  );
}

export const DOC_TYPES: TypeChip[] = [
  { ext: "csv", labelKey: "sidebar.newCsv", titleKey: "dialog.newCsvTitle", descKey: "dialog.newCsvDescription" },
  ...JSON_DOC_TYPES,
  { ext: "yaml", labelKey: "sidebar.newYaml", titleKey: "dialog.newYamlTitle", descKey: "dialog.newYamlDescription" },
  { ext: "yml", labelKey: "sidebar.newYaml", titleKey: "dialog.newYamlTitle", descKey: "dialog.newYamlDescription" },
  { ext: "toml", labelKey: "sidebar.newToml", titleKey: "dialog.newTomlTitle", descKey: "dialog.newTomlDescription" },
  { ext: "conf", labelKey: "sidebar.newConf", titleKey: "dialog.newConfTitle", descKey: "dialog.newConfDescription" },
  { ext: "env", labelKey: "sidebar.newEnv", titleKey: "dialog.newEnvTitle", descKey: "dialog.newEnvDescription" },
  { ext: "properties", labelKey: "sidebar.newProperties", titleKey: "dialog.newPropertiesTitle", descKey: "dialog.newPropertiesDescription" },
  { ext: "mermaid", labelKey: "sidebar.newMermaid", titleKey: "dialog.newMermaidTitle", descKey: "dialog.newMermaidDescription" },
  { ext: "txt", labelKey: "sidebar.newText", titleKey: "dialog.newTextTitle", descKey: "dialog.newTextDescription" },
];
