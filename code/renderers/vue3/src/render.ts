/* eslint-disable no-param-reassign */
import { dedent } from 'ts-dedent';
import { createApp, h, ref, reactive, toRefs } from 'vue';
import type { RenderContext, ArgsStoryFn } from '@storybook/types';

import type { Args, StoryContext } from '@storybook/csf';
import type { StoryFnVueReturnType, VueRenderer } from './types';

export const render: ArgsStoryFn<VueRenderer> = (props, context) => {
  const { id, component: Component } = context;
  if (!Component) {
    throw new Error(
      `Unable to render story ${id} as the component annotation is missing from the default export`
    );
  }

  return h(Component, props, getSlots(props, context));
};

let setupFunction = (_app: any) => {};
export const setup = (fn: (app: any) => void) => {
  setupFunction = fn;
};

const map = new Map<
  VueRenderer['canvasElement'],
  { vueApp: ReturnType<typeof createApp>; reactiveArgs: any }
>();

export function renderToCanvas(
  renderStoryContext: RenderContext<VueRenderer>,
  canvasElement: VueRenderer['canvasElement']
) {
  // TODO: explain cyclical nature of these app => story => mount
  const { storyFn, forceRemount, showMain, showError, showException, name, title, storyContext } =
    renderStoryContext;
  const state = reactive(storyContext.args || {});
  storyContext.args = toRefs(state);

  const element: StoryFnVueReturnType = storyFn(storyContext);

  const reactiveArgs = state;

  if (!element) {
    showError({
      title: `Expecting a Vue component from the story: "${name}" of "${title}".`,
      description: dedent`
      Did you forget to return the Vue component from the story?
      Use "() => ({ template: '<my-comp></my-comp>' })" or "() => ({ components: MyComp, template: '<my-comp></my-comp>' })" when defining the story.
      `,
    });
    return () => {};
  }

  const existingApp = map.get(canvasElement);

  if (existingApp && !forceRemount) {
    updateArgs(existingApp.reactiveArgs, reactiveArgs);
    return () => {
      teardown(existingApp.vueApp, canvasElement);
    };
  }

  const storybookApp = createApp({
    render() {
      map.set(canvasElement, { vueApp: storybookApp, reactiveArgs });
      return h(element, reactiveArgs);
    },
  });

  storybookApp.config.errorHandler = (e: unknown) => showException(e as Error);
  setupFunction(storybookApp);
  storybookApp.mount(canvasElement);

  showMain();
  return () => {
    teardown(storybookApp, canvasElement);
  };
}

/**
 * get the slots as functions to be rendered
 * @param props
 * @param context
 */

function getSlots(props: Args, context: StoryContext<VueRenderer, Args>) {
  const { argTypes } = context;
  const slots = Object.entries(props)
    .filter(([key, value]) => argTypes[key]?.table?.category === 'slots')
    .map(([key, value]) => [key, () => h('span', JSON.stringify(value))]);

  return Object.fromEntries(slots);
}

/**
 *  update the reactive args
 * @param reactiveArgs
 * @param nextArgs
 * @returns
 */
function updateArgs(reactiveArgs: Args, nextArgs: Args) {
  if (!nextArgs) return;
  Object.keys(reactiveArgs).forEach((key) => {
    delete reactiveArgs[key];
  });
  Object.assign(reactiveArgs, nextArgs);
}

function teardown(
  storybookApp: ReturnType<typeof createApp>,
  canvasElement: VueRenderer['canvasElement']
) {
  storybookApp?.unmount();
  if (map.has(canvasElement)) map.delete(canvasElement);
}

function reactiveC(props: Args) {
  // using ref instead of reactive to avoid the need to call `toRefs` in the template
  const reactiveArgs: Args[keyof Args] = {};
  Object.keys(props).forEach((key) => {
    reactiveArgs[key] = ref(props[key]);
  });
  return reactiveArgs;
}
