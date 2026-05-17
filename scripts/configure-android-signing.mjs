import fs from "node:fs";
import path from "node:path";

const gradlePath = path.resolve("src-tauri/gen/android/app/build.gradle.kts");

if (!fs.existsSync(gradlePath)) {
  throw new Error(`Android Gradle file not found: ${gradlePath}`);
}

let source = fs.readFileSync(gradlePath, "utf8");

if (!source.includes("import java.io.FileInputStream")) {
  source = `import java.io.FileInputStream\nimport java.util.Properties\n${source}`;
}

if (!source.includes('create("release")')) {
  const signingBlock = `
    signingConfigs {
        create("release") {
            val keystorePropertiesFile = rootProject.file("keystore.properties")
            val keystoreProperties = Properties()

            if (keystorePropertiesFile.exists()) {
                keystoreProperties.load(FileInputStream(keystorePropertiesFile))
            }

            keyAlias = keystoreProperties["keyAlias"] as String
            keyPassword = keystoreProperties["password"] as String
            storeFile = file(keystoreProperties["storeFile"] as String)
            storePassword = keystoreProperties["password"] as String
        }
    }
`;

  source = source.replace(/\n\s*buildTypes\s*\{/, `${signingBlock}\n    buildTypes {`);
}

if (!source.includes('signingConfig = signingConfigs.getByName("release")')) {
  source = source.replace(
    /getByName\("release"\)\s*\{/,
    'getByName("release") {\n            signingConfig = signingConfigs.getByName("release")',
  );
}

fs.writeFileSync(gradlePath, source);
