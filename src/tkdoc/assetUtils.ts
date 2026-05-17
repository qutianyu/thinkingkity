import { copyFile, createFolder, pathBasename, pathJoin, readDirectory } from "@/lib/tauriCommands";

function uniqueName(name: string, existingNames: Set<string>): string {
  if (!existingNames.has(name)) return name;
  const dotIndex = name.lastIndexOf(".");
  const stem = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  const ext = dotIndex > 0 ? name.slice(dotIndex) : "";
  let index = 1;
  let next = `${stem}-${index}${ext}`;
  while (existingNames.has(next)) {
    index += 1;
    next = `${stem}-${index}${ext}`;
  }
  return next;
}

async function nextAssetPath(vaultPath: string, preferredName: string): Promise<string> {
  const assetsPath = pathJoin(vaultPath, "assets");
  await createFolder(assetsPath);
  let names = new Set<string>();
  try {
    names = new Set((await readDirectory(assetsPath)).map((entry) => entry.name));
  } catch {
    names = new Set();
  }
  return pathJoin(assetsPath, uniqueName(preferredName, names));
}

export async function copyTkdocAssetToVault(vaultPath: string, sourcePath: string): Promise<string> {
  const destinationPath = await nextAssetPath(vaultPath, pathBasename(sourcePath));
  if (destinationPath !== sourcePath) {
    await copyFile(sourcePath, destinationPath);
  }
  return destinationPath;
}
