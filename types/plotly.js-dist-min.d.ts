declare module "plotly.js-dist-min" {
  export interface PlotlyApi {
    react(
      root: HTMLElement,
      data: readonly unknown[],
      layout?: unknown,
      config?: unknown,
    ): Promise<HTMLElement>;
    relayout(root: HTMLElement, update: Record<string, unknown>): Promise<HTMLElement>;
    purge(root: HTMLElement): void;
    Plots: {
      resize(root: HTMLElement): void | Promise<void>;
    };
  }

  const Plotly: PlotlyApi;
  export default Plotly;
}
