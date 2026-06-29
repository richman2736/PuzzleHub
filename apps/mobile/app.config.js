const variants = {
  development: {
    name: "PuzzleHub Dev",
    slug: "puzzlehub-dev",
  },
  preview: {
    name: "PuzzleHub Preview",
    slug: "puzzlehub-preview",
  },
  production: {
    name: "PuzzleHub",
    slug: "puzzlehub",
  },
};

function resolveVariant() {
  const variant = process.env.APP_VARIANT ?? process.env.EAS_BUILD_PROFILE;
  return variants[variant] ? variant : "development";
}

module.exports = function configure({ config }) {
  const variantName = resolveVariant();
  const variant = variants[variantName];

  return {
    ...config,
    name: variant.name,
    slug: variant.slug,
    extra: {
      ...config.extra,
      appVariant: variantName,
    },
  };
};
