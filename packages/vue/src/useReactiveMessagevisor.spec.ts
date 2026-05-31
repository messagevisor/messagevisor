import { mount } from "@vue/test-utils";
import { computed, defineComponent, h, nextTick, ref } from "vue";

import { MessagevisorProvider } from "./MessagevisorProvider";
import {
  useCurrency,
  useDirection,
  useFormatDate,
  useFormatDateTimeRange,
  useFormatMessage,
  useFormatNumber,
  useFormatNumberToParts,
  useFormatPlural,
  useFormatRelativeTime,
  useFormatTime,
  useLocale,
  useLocaleInfo,
  useMessagevisorContext,
  useTimeZone,
  useTranslation,
} from "./useReactiveMessagevisor";
import { useMessagevisorSnapshot } from "./useMessagevisorSnapshot";
import { useSdk } from "./useSdk";
import { createTestInstance, nlDatafile } from "./testUtils";

describe("reactive composables", function () {
  it("recomputes focused state when the SDK snapshot changes", async function () {
    const m = createTestInstance();
    const Child = defineComponent({
      setup() {
        const sdk = useSdk(); // eslint-disable-line @typescript-eslint/no-unused-vars
        const snapshot = useMessagevisorSnapshot();
        const locale = useLocale();
        const direction = useDirection();
        const info = useLocaleInfo();
        const context = useMessagevisorContext();
        const currency = useCurrency();
        const timeZone = useTimeZone();

        return () =>
          h("div", [
            h("span", { class: "locale" }, locale.value || ""),
            h("span", { class: "direction" }, direction.value || ""),
            h("span", { class: "info" }, info.value.locale || ""),
            h("span", { class: "context" }, String(context.value.plan || "")),
            h("span", { class: "currency" }, currency.value || ""),
            h("span", { class: "timeZone" }, timeZone.value || ""),
            h(
              "span",
              { class: "revision" },
              snapshot.value.datafileRevisionsByLocale[locale.value || ""],
            ),
          ]);
      },
    });

    const wrapper = mount(MessagevisorProvider, {
      props: { instance: m },
      slots: { default: () => h(Child) },
    });

    m.setContext({ plan: "pro" });
    m.setCurrency("EUR");
    m.setTimeZone("Europe/Amsterdam");
    m.setDatafile(nlDatafile);
    m.setLocale("nl-NL");
    await nextTick();

    expect(wrapper.find(".locale").text()).toEqual("nl-NL");
    expect(wrapper.find(".direction").text()).toEqual("ltr");
    expect(wrapper.find(".info").text()).toEqual("nl-NL");
    expect(wrapper.find(".context").text()).toEqual("pro");
    expect(wrapper.find(".currency").text()).toEqual("EUR");
    expect(wrapper.find(".timeZone").text()).toEqual("Europe/Amsterdam");
    expect(wrapper.find(".revision").text()).toEqual("1-nl");
  });

  it("accepts plain values, refs, computed refs, and getters", async function () {
    const m = createTestInstance();
    const key = ref("greeting");
    const name = ref("Ada");
    const plan = ref("free");
    const amount = ref(12);
    const Child = defineComponent({
      setup() {
        const preset = computed(() => "money");
        const translation = useTranslation(
          () => key.value,
          { name },
          () => ({ context: { plan: plan.value } }),
        );
        const total = useFormatMessage("Total: {amount, number, money}", { amount });
        const money = useFormatNumber(amount, preset);

        return () =>
          h("div", [
            h("span", { class: "translation" }, translation.value),
            h("span", { class: "total" }, total.value),
            h("span", { class: "money" }, money.value),
          ]);
      },
    });

    const wrapper = mount(MessagevisorProvider, {
      props: { instance: m },
      slots: { default: () => h(Child) },
    });

    expect(wrapper.find(".translation").text()).toEqual("Hello Ada");
    expect(wrapper.find(".total").text()).toContain("$12.00");
    expect(wrapper.find(".money").text()).toContain("$12.00");

    name.value = "Grace";
    plan.value = "pro";
    amount.value = 18;
    await nextTick();

    expect(wrapper.find(".translation").text()).toEqual("Welcome back, pro Grace");
    expect(wrapper.find(".total").text()).toContain("$18.00");
    expect(wrapper.find(".money").text()).toContain("$18.00");
  });

  it("covers formatter composables", function () {
    const m = createTestInstance();
    const Child = defineComponent({
      setup() {
        const date = "2026-05-12T12:30:00Z";

        const currency = useFormatNumber(12, "money", { currency: "EUR" });
        const formattedDate = useFormatDate(date, "short");
        const range = useFormatDateTimeRange(date, "2026-05-13T12:30:00Z", "short");
        const numberParts = useFormatNumberToParts(12, "money");
        const plural = useFormatPlural(1);
        const relative = useFormatRelativeTime(-1, "day", "short");
        const time = useFormatTime(date, "short");

        return () =>
          h("div", [
            h("span", { class: "currency" }, currency.value),
            h("span", { class: "date" }, formattedDate.value),
            h("span", { class: "range" }, range.value),
            h("span", { class: "parts" }, String(numberParts.value.length > 0)),
            h("span", { class: "plural" }, plural.value),
            h("span", { class: "relative" }, relative.value),
            h("span", { class: "time" }, time.value),
          ]);
      },
    });

    const wrapper = mount(MessagevisorProvider, {
      props: { instance: m },
      slots: { default: () => h(Child) },
    });

    expect(wrapper.find(".currency").text()).toContain("€");
    expect(wrapper.find(".date").text()).toContain("5/12/26");
    expect(wrapper.find(".range").text()).toContain("May");
    expect(wrapper.find(".parts").text()).toEqual("true");
    expect(wrapper.find(".plural").text()).toEqual("one");
    expect(wrapper.find(".relative").text()).toEqual("yesterday");
    expect(wrapper.find(".time").text()).toContain("12:30");
  });

  it("unsubscribes from SDK changes on unmount", function () {
    const m = createTestInstance();
    const unsubscribe = jest.fn();
    const subscribe = jest.spyOn(m, "subscribe").mockReturnValue(unsubscribe);
    const Child = defineComponent({
      setup() {
        useLocale();

        return () => h("p", "ok");
      },
    });

    const wrapper = mount(MessagevisorProvider, {
      props: { instance: m },
      slots: { default: () => h(Child) },
    });

    expect(subscribe).toHaveBeenCalledTimes(1);
    wrapper.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
