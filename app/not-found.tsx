import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found-page">
      <div className="not-found-mark">404</div>
      <h1>This page is not part of the network.</h1>
      <p>The address may have changed, or the page may not exist yet.</p>
      <Link href="/en" className="button button-primary focus-ring">
        Return home
      </Link>
    </main>
  );
}
