const { createICUModule } = require("@messagevisor/module-icu");

module.exports = {
  modules: [createICUModule()],
  sets: true,
  promotionFlows: [
    { from: "dev", to: "staging" },
    { from: "staging", to: "production" },
  ],
};
