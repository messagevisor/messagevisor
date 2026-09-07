import { performance } from "node:perf_hooks";
import process from "node:process";

async function main() {
  const { createMessagevisor } = await import(process.argv[2] || "../node-esm/index.js");
  const { createICUModule } = await import(process.argv[3] || "../../module-icu/lib/index.js");

  if (process.version !== "v24.16.0") throw new Error("Use Node.js 24.16.0");
  const formats = { number: {}, date: {}, time: {} };
  for (let i = 0; i < 40; i++) {
    formats.number[`n${i}`] = { maximumFractionDigits: 2 };
    formats.date[`d${i}`] = { year: "numeric", month: "short", day: "numeric" };
    formats.time[`t${i}`] = { hour: "numeric", minute: "2-digit" };
  }
  const sdk = createMessagevisor({
    locale: "en-GB",
    defaultFormats: { "en-GB": formats },
    defaultTranslations: { "en-GB": { plain: "Hello", icu: "Amount: {n, number, n0}" } },
    modules: [createICUModule()],
    logLevel: "error",
  });
  const cases = {
    "direct explicit": () => sdk.formatNumber(1234.5, { maximumFractionDigits: 2 }),
    "direct preset": () => sdk.formatNumber(1234.5, "n0"),
    "direct date": () => sdk.formatDate(0, "d0"),
    "plain translation": () => sdk.translate("plain"),
    "ICU translation": () => sdk.translate("icu", { n: 1234.5 }),
  };
  const lean = createMessagevisor({
    locale: "en-GB",
    defaultTranslations: { "en-GB": { plain: "Hello" } },
    logLevel: "error",
  });
  const leanICU = createMessagevisor({
    locale: "en-GB",
    modules: [createICUModule()],
    logLevel: "error",
  });
  cases["lean translation"] = () => lean.translate("plain");
  cases["lean ICU"] = () => leanICU.formatMessage("Hello {name}", { name: "Ada" });
  const selectedCases = process.argv[4]
    ? Object.entries(cases).filter(([name]) => name.startsWith(process.argv[4]))
    : Object.entries(cases);
  for (const [name, run] of selectedCases) {
    const iterations = name.startsWith("lean") ? 100000 : 1000;
    for (let i = 0; i < (name.startsWith("lean") ? 10000 : 300); i++) run();
    const samples = [];
    for (let sample = 0; sample < 7; sample++) {
      const start = performance.now();
      for (let i = 0; i < iterations; i++) run();
      samples.push(((performance.now() - start) * 1000) / iterations);
    }
    samples.sort((a, b) => a - b);
    console.log(`${name}: ${samples[3].toFixed(2)} ms / 1000 calls (median of 7)`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
