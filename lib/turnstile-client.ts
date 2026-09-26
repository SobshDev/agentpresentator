type Turnstile = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  execute: (id: string) => void;
  reset: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let loader: Promise<Turnstile> | null = null;

function load(): Promise<Turnstile> {
  loader ??= new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")));
    script.onerror = () => reject(new Error("turnstile"));
    document.head.appendChild(script);
  });
  return loader;
}

/** Runs an invisible Turnstile check and resolves with a single-use token. */
export async function turnstileToken(siteKey: string, container: HTMLElement): Promise<string> {
  const turnstile = await load();
  return new Promise((resolve, reject) => {
    container.replaceChildren();
    const id = turnstile.render(container, {
      sitekey: siteKey,
      theme: "dark",
      appearance: "interaction-only",
      execution: "execute",
      callback: (token: string) => resolve(token),
      "error-callback": () => reject(new Error("turnstile")),
      "expired-callback": () => reject(new Error("turnstile")),
    });
    turnstile.execute(id);
  });
}
