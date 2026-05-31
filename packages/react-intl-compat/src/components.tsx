import * as React from "react";

import { MessagevisorContext } from "@messagevisor/react";

import { useIntl } from "./IntlContext";
import { mergeRichTextValues, type IntlMessageValues, type WithIntlProps } from "./intl";

function useIntlContext() {
  const context = React.useContext(MessagevisorContext);

  if (!context) {
    throw new Error("Formatted components must be used within MessagevisorProvider.");
  }

  return context;
}

function renderOutput(
  output: React.ReactNode,
  textComponent?: React.ElementType,
  tagName?: React.ElementType,
  wrapRichTextChunksInFragment?: boolean,
) {
  const Component = tagName || textComponent;
  const content =
    wrapRichTextChunksInFragment !== false && Array.isArray(output) ? (
      <React.Fragment>
        {output.map((chunk, index) => (
          <React.Fragment key={index}>{chunk}</React.Fragment>
        ))}
      </React.Fragment>
    ) : (
      output
    );

  if (!Component) {
    return content;
  }

  return <Component>{content}</Component>;
}

export function FormattedMessage(props: {
  id?: string;
  defaultMessage?: string;
  description?: string;
  values?: IntlMessageValues;
  tagName?: React.ElementType;
  children?: (nodes: React.ReactNode) => React.ReactNode;
}) {
  const intl = useIntl();
  const context = useIntlContext();
  const values = mergeRichTextValues(
    context.defaultRichTextElements,
    props.values,
    props.defaultMessage ||
      (props.id
        ? intl.messagevisor.getRawTranslation(props.id as any, {
            defaultTranslation: props.defaultMessage,
          })
        : undefined),
  );
  const output = intl.formatMessage(
    {
      id: props.id as any,
      defaultMessage: props.defaultMessage,
      description: props.description,
    },
    values,
  );

  if (props.children) {
    return <>{props.children(output as React.ReactNode)}</>;
  }

  return (
    <>
      {renderOutput(
        output as React.ReactNode,
        context.textComponent,
        props.tagName,
        context.wrapRichTextChunksInFragment,
      )}
    </>
  );
}

export function FormattedDate(props: {
  value: Date | number | string;
  format?: any;
  children?: (value: string) => React.ReactNode;
}) {
  const intl = useIntl();
  const context = useIntlContext();
  const output = intl.formatDate(props.value, props.format);

  if (props.children) return <>{props.children(output)}</>;

  return <>{renderOutput(output, context.textComponent)}</>;
}

export function FormattedTime(props: {
  value: Date | number | string;
  format?: any;
  children?: (value: string) => React.ReactNode;
}) {
  const intl = useIntl();
  const context = useIntlContext();
  const output = intl.formatTime(props.value, props.format);

  if (props.children) return <>{props.children(output)}</>;

  return <>{renderOutput(output, context.textComponent)}</>;
}

export function FormattedNumber(props: {
  value: number;
  format?: any;
  children?: (value: string) => React.ReactNode;
}) {
  const intl = useIntl();
  const context = useIntlContext();
  const output = intl.formatNumber(props.value, props.format);

  if (props.children) return <>{props.children(output)}</>;

  return <>{renderOutput(output, context.textComponent)}</>;
}

export function FormattedRelativeTime(props: {
  value: number;
  unit: Intl.RelativeTimeFormatUnit;
  format?: any;
  children?: (value: string) => React.ReactNode;
}) {
  const intl = useIntl();
  const context = useIntlContext();
  const output = intl.formatRelativeTime(props.value, props.unit, props.format);

  if (props.children) return <>{props.children(output)}</>;

  return <>{renderOutput(output, context.textComponent)}</>;
}

export function FormattedList(props: {
  value: string[];
  options?: any;
  children?: (value: string) => React.ReactNode;
}) {
  const intl = useIntl();
  const context = useIntlContext();
  const output = intl.formatList(props.value, props.options);

  if (props.children) return <>{props.children(output)}</>;

  return <>{renderOutput(output, context.textComponent)}</>;
}

export function FormattedDisplayName(props: {
  value: string;
  type: string;
  style?: string;
  fallback?: string;
  children?: (value: string | undefined) => React.ReactNode;
}) {
  const intl = useIntl();
  const context = useIntlContext();
  const output = intl.formatDisplayName(props.value, {
    type: props.type,
    style: props.style,
    fallback: props.fallback,
  });

  if (props.children) return <>{props.children(output)}</>;

  return <>{renderOutput(output || "", context.textComponent)}</>;
}

export function FormattedPlural(props: {
  value: number;
  zero?: React.ReactNode;
  one?: React.ReactNode;
  two?: React.ReactNode;
  few?: React.ReactNode;
  many?: React.ReactNode;
  other: React.ReactNode;
}) {
  const intl = useIntl();
  const context = useIntlContext();
  const category = intl.formatPlural(props.value);
  const byCategory: Record<string, React.ReactNode> = {
    zero: props.zero,
    one: props.one,
    two: props.two,
    few: props.few,
    many: props.many,
    other: props.other,
  };

  return <>{renderOutput(byCategory[category] || props.other, context.textComponent)}</>;
}

export function FormattedNumberParts(props: {
  value: number;
  format?: any;
  children: (parts: Intl.NumberFormatPart[]) => React.ReactNode;
}) {
  const intl = useIntl();
  return <>{props.children(intl.formatNumberToParts(props.value, props.format))}</>;
}

export function FormattedDateParts(props: {
  value: Date | number | string;
  format?: any;
  children: (parts: Intl.DateTimeFormatPart[]) => React.ReactNode;
}) {
  const intl = useIntl();
  return <>{props.children(intl.formatDateToParts(props.value, props.format))}</>;
}

export function FormattedTimeParts(props: {
  value: Date | number | string;
  format?: any;
  children: (parts: Intl.DateTimeFormatPart[]) => React.ReactNode;
}) {
  const intl = useIntl();
  return <>{props.children(intl.formatTimeToParts(props.value, props.format))}</>;
}

export function FormattedListParts(props: {
  value: string[];
  options?: any;
  children: (parts: any[]) => React.ReactNode;
}) {
  const intl = useIntl();
  return <>{props.children(intl.formatListToParts(props.value, props.options))}</>;
}

export function injectIntl<P extends WithIntlProps>(Component: React.ComponentType<P>) {
  function WrappedComponent(props: Omit<P, keyof WithIntlProps>) {
    const intl = useIntl();

    return <Component {...(props as P)} intl={intl} />;
  }

  WrappedComponent.displayName = `injectIntl(${Component.displayName || Component.name || "Component"})`;

  return WrappedComponent;
}
