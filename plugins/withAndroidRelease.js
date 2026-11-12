/**
 * Re-applies the Android release setup after every `expo prebuild`.
 *
 * `android/` is generated (and gitignored), so `prebuild --clean` throws away
 * everything that was hand-edited in it: the release signing config, R8 /
 * resource shrinking, the proguard rules and the lint options. This plugin puts
 * all of that back, so a fresh prebuild gives a signed release build.
 *
 * The signing key never lives inside `android/`. Gradle is pointed straight at
 * the keystore's real location by absolute path, so cleaning or regenerating
 * `android/` (or `git clean -fdx` in the project) cannot remove it.
 *
 * Signing material is looked up in this order (first folder that has a
 * `keystore.properties` wins):
 *   1. $PHOTOCELL_SIGNING_DIR
 *   2. ~/.photocell-signing/            <- the permanent home of the key
 *   3. the project root                 (gitignored fallback)
 * The folder holds `release-key.jks` and `keystore.properties` with
 *     storeFile=release-key.jks          (relative to that folder, or absolute)
 *     storePassword=...
 *     keyAlias=...
 *     keyPassword=...
 * Environment variables PHOTOCELL_STORE_FILE / _STORE_PASSWORD / _KEY_ALIAS /
 * _KEY_PASSWORD override single values. Secrets never live in this file. If
 * nothing is found the plugin only warns and leaves the build unsigned instead
 * of failing the prebuild.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  withAppBuildGradle,
  withGradleProperties,
  withDangerousMod,
  withAndroidManifest,
} = require('@expo/config-plugins');

const KEYSTORE_NAME = 'release-key.jks';

function signingDirs(projectRoot) {
  return [
    process.env.PHOTOCELL_SIGNING_DIR,
    path.join(os.homedir(), '.photocell-signing'),
    projectRoot,
  ].filter(Boolean);
}

function readSigning(projectRoot) {
  const fromFile = {};
  let dir = null;
  for (const candidate of signingDirs(projectRoot)) {
    const propsPath = path.join(candidate, 'keystore.properties');
    if (!fs.existsSync(propsPath)) continue;
    dir = candidate;
    for (const line of fs.readFileSync(propsPath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z]+)\s*=\s*(.*?)\s*$/);
      if (match) fromFile[match[1]] = match[2];
    }
    break;
  }
  const env = process.env;
  const base = dir || projectRoot;
  const storeFile = path.resolve(
    base,
    env.PHOTOCELL_STORE_FILE || fromFile.storeFile || KEYSTORE_NAME
  );
  const signing = {
    // Absolute, with forward slashes: valid in gradle.properties on every OS.
    storeFile: storeFile.replace(/\\/g, '/'),
    storePassword: env.PHOTOCELL_STORE_PASSWORD || fromFile.storePassword,
    keyAlias: env.PHOTOCELL_KEY_ALIAS || fromFile.keyAlias,
    keyPassword: env.PHOTOCELL_KEY_PASSWORD || fromFile.keyPassword,
  };
  const complete =
    Boolean(signing.storePassword && signing.keyAlias && signing.keyPassword) &&
    fs.existsSync(storeFile);
  return { ...signing, complete };
}

function setProperty(items, key, value) {
  const existing = items.find((item) => item.type === 'property' && item.key === key);
  if (existing) existing.value = value;
  else items.push({ type: 'property', key, value });
}

const withGradleSettings = (config) =>
  withGradleProperties(config, (cfg) => {
    const items = cfg.modResults;
    // R8 minification + resource shrinking for the Play Store build.
    setProperty(items, 'android.enableMinifyInReleaseBuilds', 'true');
    setProperty(items, 'android.enableShrinkResourcesInReleaseBuilds', 'true');
    setProperty(items, 'android.enableR8.fullMode', 'true');

    const signing = readSigning(cfg.modRequest.projectRoot);
    if (signing.complete) {
      setProperty(items, 'MYAPP_RELEASE_STORE_FILE', signing.storeFile);
      setProperty(items, 'MYAPP_RELEASE_KEY_ALIAS', signing.keyAlias);
      setProperty(items, 'MYAPP_RELEASE_STORE_PASSWORD', signing.storePassword);
      setProperty(items, 'MYAPP_RELEASE_KEY_PASSWORD', signing.keyPassword);
    } else {
      console.warn(
        '[withAndroidRelease] Signing key not found (looked in ' +
          signingDirs(cfg.modRequest.projectRoot).join(', ') +
          '). The release build will not be signed.'
      );
    }
    return cfg;
  });

const withBuildGradle = (config) =>
  withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;

    // 1) A `release` signing config that reads the MYAPP_RELEASE_* properties.
    const signingBlock = gradle.match(/signingConfigs\s*\{[\s\S]*?\n {4}\}\n/);
    if (signingBlock && !/\brelease\s*\{/.test(signingBlock[0])) {
      gradle = gradle.replace(
        /(signingConfigs\s*\{\s*debug\s*\{[\s\S]*?\n\s{8}\}\n)/,
        `$1        release {
            if (project.hasProperty('MYAPP_RELEASE_STORE_FILE')) {
                storeFile file(MYAPP_RELEASE_STORE_FILE)
                storePassword MYAPP_RELEASE_STORE_PASSWORD
                keyAlias MYAPP_RELEASE_KEY_ALIAS
                keyPassword MYAPP_RELEASE_KEY_PASSWORD
            }
        }
`
      );
    }

    // 2) Sign the release build type with it (the template uses the debug key).
    gradle = gradle.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
      '$1signingConfig signingConfigs.release'
    );

    // 3) Don't let lint abort or slow the release build.
    if (!/lintOptions/.test(gradle)) {
      gradle = gradle.replace(
        /(\n\s*androidResources\s*\{[\s\S]*?\n\s{4}\}\n)/,
        `$1    lintOptions {
        checkReleaseBuilds false
        abortOnError false
    }
`
      );
    }

    cfg.modResults.contents = gradle;
    return cfg;
  });

const withReleaseFiles = (config) =>
  withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const appDir = path.join(cfg.modRequest.platformProjectRoot, 'app');

      // Proguard / R8 rules.
      const rules = path.join(projectRoot, 'plugins', 'android', 'proguard-rules.pro');
      if (fs.existsSync(rules)) {
        fs.copyFileSync(rules, path.join(appDir, 'proguard-rules.pro'));
      }
      return cfg;
    },
  ]);


const withManifestConfig = (config) =>
  withAndroidManifest(config, (cfg) => {
    const mainApplication = cfg.modResults.manifest.application?.[0];
    if (mainApplication) {
      mainApplication.$['android:resizeableActivity'] = 'true';
      const mainActivity = mainApplication.activity?.find(
        (a) => a.$['android:name'] === '.MainActivity'
      );
      if (mainActivity) {
        mainActivity.$['android:resizeableActivity'] = 'true';
      }
    }
    return cfg;
  });

module.exports = (config) => withManifestConfig(withReleaseFiles(withBuildGradle(withGradleSettings(config))));
