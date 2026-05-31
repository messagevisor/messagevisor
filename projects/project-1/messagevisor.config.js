const { createICUModule } = require("@messagevisor/module-icu");

module.exports = {
  modules: [createICUModule()],
  // icuSkeleton: true,
  // namespaceCharacter: "_",
};
