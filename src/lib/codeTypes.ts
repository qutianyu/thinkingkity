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
  { ext: "md", labelKey: "sidebar.newMarkdown", titleKey: "dialog.newMarkdownTitle", descKey: "dialog.newMarkdownDescription" },
  { ext: "csv", labelKey: "sidebar.newCsv", titleKey: "dialog.newCsvTitle", descKey: "dialog.newCsvDescription" },
  { ext: "json", labelKey: "sidebar.newJson", titleKey: "dialog.newJsonTitle", descKey: "dialog.newJsonDescription" },
  { ext: "txt", labelKey: "sidebar.newText", titleKey: "dialog.newTextTitle", descKey: "dialog.newTextDescription" },
];
