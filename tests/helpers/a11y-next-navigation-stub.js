export function usePathname() {
  return "/en";
}

export function useSearchParams() {
  return new URLSearchParams();
}

export function useRouter() {
  return { push() {}, replace() {}, prefetch() {} };
}

export function notFound() {
  throw new Error("notFound");
}

export function redirect() {
  throw new Error("redirect");
}
