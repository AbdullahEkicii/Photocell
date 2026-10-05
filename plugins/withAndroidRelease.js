/**
 * Re-applies the Android release setup after every `expo prebuild`.
 *
 * `android/` is generated (and gitignored), so `prebuild --clean` throws away
 * everything that was hand-edited in it: the release signing config, the
 * keystore copy, R8/resource shrinking and the proguard rules. This plugin
 * puts all of that back, so a fresh prebuild gives a signed release build.
 *
 * Secrets never live in this file. Signing values come from, in order:
 *   1. environment variables  PHOTOCELL_STORE_FILE / _STORE_PASSWORD / _KEY_ALIAS / _KEY_PASSWORD
 *   2. `keystore.properties` in the project root (gitignored), with the keys
 *        storeFile=release-key.jks
 *        storePassword=...
 *        keyAlias=...
 *        keyPassword=...
 * The keystore itself is read from `storeFile` (relative to the project root)
 * and copied to `android/app/`. If no signing values are found the plugin only
 * warns and leaves the build unsigned instead of failing the prebuild.
 */
const fs = require('fs');
const path = require('path');
const {
  withAppBuildGradle,
  withGradleProperties,
  withDangerousMod,
} = require('@expo/config-plugins');

const KEYSTORE_NAME = 'release-key.jks';

function readSigning(projectRoot) {
  const fromFile = {};
  const propsPath = path.join(projectRoot, 'keystore.properties');
  if (fs.existsSync(propsPath)) {
    for (const line of fs.readFileSync(propsPath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z]+)\s*=\s*(.*?)\s*$/);
      if (match) fromFile[match[1]] = match[2];
    }
  }
  const env = process.env;
  const signing = {
    storeFile: env.PHOTOCELL_STORE_FILE || fromFile.storeFile || KEYSTORE_NAME,
    storePassword: env.PHOTOCELL_STORE_PASSWORD || fromFile.storePassword,
    keyAlias: env.PHOTOCELL_KEY_ALIAS || fromFile.keyAlias,
    keyPassword: env.PHOTOCELL_KEY_PASSWORD || fromFile.keyPassword,
  };
  const complete = Boolean(signing.storePassword && signing.keyAlias && signing.keyPassword);
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

    const signing = readSigning(cfg.modRequest.projectRoot);
    if (signing.complete) {
      setProperty(items, 'MYAPP_RELEASE_STORE_FILE', KEYSTORE_NAME);
      setProperty(items, 'MYAPP_RELEASE_KEY_ALIAS', signing.keyAlias);
      setProperty(items, 'MYAPP_RELEASE_STORE_PASSWORD', signing.storePassword);
      setProperty(items, 'MYAPP_RELEASE_KEY_PASSWORD', signing.keyPassword);
    } else {
      console.warn(
        '[withAndroidRelease] No signing values (keystore.properties or PHOTOCELL_* env). ' +
          'The release build will not be signed.'
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

      // Keystore: copy it next to the app module, where Gradle looks for it.
      const signing = readSigning(projectRoot);
      const source = path.resolve(projectRoot, signing.storeFile);
      if (fs.existsSync(source)) {
        fs.copyFileSync(source, path.join(appDir, KEYSTORE_NAME));
      } else {
        console.warn(`[withAndroidRelease] Keystore not found at ${source}.`);
      }

      // Proguard / R8 rules.
      const rules = path.join(projectRoot, 'plugins', 'android', 'proguard-rules.pro');
      if (fs.existsSync(rules)) {
        fs.copyFileSync(rules, path.join(appDir, 'proguard-rules.pro'));
      }
      return cfg;
    },
  ]);

module.exports = (config) => withReleaseFiles(withBuildGradle(withGradleSettings(config)));
