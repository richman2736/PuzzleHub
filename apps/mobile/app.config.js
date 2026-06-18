const baseConfig = require("./app.json");

const variants = {
  development: {
    name: "PuzzleHub Dev",
    slug: "puzzlehub-dev",
    scheme: "puzzlehub-dev",
    iosBundleIdentifier: "app.puzzlehub.mobile.dev",
    androidPackage: "app.puzzlehub.mobile.dev",
  },
  preview: {
    name: "PuzzleHub Preview",
    slug: "puzzlehub-preview",
    scheme: "puzzlehub-preview",
    iosBundleIdentifier: "app.puzzlehub.mobile.preview",
    androidPackage: "app.puzzlehub.mobile.preview",
  },
  production: {
    name: "PuzzleHub",
    slug: "puzzlehub",
    scheme: "puzzlehub",
    iosBundleIdentifier: "app.puzzlehub.mobile",
    androidPackage: "app.puzzlehub.mobile",
  },
};

function resolveVariant() {
  const variant = process.env.APP_VARIANT ?? process.env.EAS_BUILD_PROFILE;
  return variants[variant] ? variant : "development";
}

module.exports = function configure() {
  const variant = variants[resolveVariant()];
  const expo = baseConfig.expo;

  return {
    ...expo,
    name: variant.name,
    slug: variant.slug,
    scheme: variant.scheme,
    ios: {
      ...expo.ios,
      bundleIdentifier: variant.iosBundleIdentifier,
    },
    android: {
      ...expo.android,
      package: variant.androidPackage,
    },
    extra: {
      ...expo.extra,
      appVariant: resolveVariant(),
    },
  };
};
