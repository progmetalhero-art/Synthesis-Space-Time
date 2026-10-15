"""Publication and safety checks for the Pages artifact, using only the stdlib."""

import importlib.util
from pathlib import Path
import tempfile
import unittest
from xml.etree import ElementTree


REPOSITORY = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("build_pages", REPOSITORY / "scripts/build_pages.py")
builder = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(builder)
ORIGINAL = builder.ORIGINAL_URL
PROJECT = "https://progmetalhero-art.github.io/Synthesis-Space-Time"


class PagesBuildTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="synthesis-pages-test-")
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.source = self.directory / "source"
        self.source.mkdir()
        self.output = self.directory / "published"
        self.main = '<main id="main-content"><h1>Το «εδώ» μένει ανοιχτό.</h1><a href="./articles/now.html">Διάβασε</a></main>'
        self.write("index.html", f'<link rel="canonical" href="{ORIGINAL}/" /><meta property="og:image" content="{ORIGINAL}/assets/cover.jpg" /><script type="application/ld+json">{{"url":"{ORIGINAL}/about"}}</script>{self.main}<a href="{ORIGINAL}/articles/now?via=web#light">Πηγή</a>')
        self.write("about.html", "<h1>About</h1>")
        self.write("404.html", '<link href="/styles.css" /><img src="/hero-cosmos.png" /><a href="/index.html">Home</a><a href="//example.org">External</a>')
        self.write("styles.css", 'body { background: url("./hero-cosmos.png") }')
        self.write("script.js", f'const original = "{ORIGINAL}";')
        self.write("articles/now.html", f'<link rel="canonical" href="{ORIGINAL}/articles/now" /><h2 id="light">Φως</h2>')
        self.write("feed.xml", f'<rss xmlns:atom="http://www.w3.org/2005/Atom"><channel><link>{ORIGINAL}/</link><atom:link href="{ORIGINAL}/feed.xml" rel="self" /><item><link>{ORIGINAL}/articles/now?via=rss#light</link><guid isPermaLink="true">{ORIGINAL}/articles/now</guid><enclosure url="{ORIGINAL}/issues/original.pdf" /></item></channel></rss>')
        self.write("sitemap.xml", f'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>{ORIGINAL}/</loc></url><url><loc>{ORIGINAL}/about</loc></url><url><loc>{ORIGINAL}/articles/now</loc></url></urlset>')
        self.write("robots.txt", f"User-agent: *\nAllow: /\nSitemap: {ORIGINAL}/sitemap.xml\n")
        self.pdf = b"%PDF-1.7\n" + ORIGINAL.encode() + b"\x00\xff\noriginal publication bytes"
        self.write("issues/original.pdf", self.pdf)
        self.write("assets/fonts/sample.woff2", b"font bytes")
        self.write("assets/THIRD-PARTY.md", "Asset provenance and licenses")
        self.write("assets/vendor/pdfjs/LICENSE", "PDF.js license")
        self.write("hero-cosmos.png", b"image bytes")
        self.write("LICENSE", "Site license")
        for name in ["README.md", "scripts/private.py", "tests/private.py", ".github/workflows/private.yml", ".git/config", ".env", "auth.json", ".hidden.txt", "assets/.private"]:
            self.write(name, "must stay private")

    def write(self, relative, content):
        path = self.source / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content if isinstance(content, bytes) else content.encode())

    def build(self, base_url=PROJECT, output=None):
        return builder.build_site(base_url, output or self.output, source_root=self.source)

    def snapshot(self, directory):
        return {path.relative_to(directory).as_posix(): path.read_bytes()
                for path in directory.rglob("*") if path.is_file()}

    def test_project_metadata_feed_and_sitemap_use_published_html_urls(self):
        self.build(PROJECT + "/")
        index = (self.output / "index.html").read_text()
        self.assertIn(f'href="{PROJECT}/"', index)
        self.assertIn(f'content="{PROJECT}/assets/cover.jpg"', index)
        self.assertIn(f'"url":"{PROJECT}/about.html"', index)
        self.assertIn(f'{PROJECT}/articles/now.html?via=web#light', index)
        self.assertIn(self.main, index)
        feed = ElementTree.parse(self.output / "feed.xml")
        self.assertEqual(feed.findtext("channel/link"), PROJECT + "/")
        self.assertEqual(feed.find("channel/{http://www.w3.org/2005/Atom}link").get("href"), PROJECT + "/feed.xml")
        self.assertEqual(feed.findtext("channel/item/link"), PROJECT + "/articles/now.html?via=rss#light")
        self.assertEqual(feed.findtext("channel/item/guid"), ORIGINAL + "/articles/now")
        self.assertEqual(feed.find("channel/item/enclosure").get("url"), PROJECT + "/issues/original.pdf")
        sitemap = ElementTree.parse(self.output / "sitemap.xml")
        self.assertEqual([element.text for element in sitemap.findall("{*}url/{*}loc")],
                         [PROJECT + "/", PROJECT + "/about.html", PROJECT + "/articles/now.html"])
        self.assertIn(PROJECT + "/sitemap.xml", (self.output / "robots.txt").read_text())
        error_page = (self.output / "404.html").read_text()
        for path in ["styles.css", "hero-cosmos.png", "index.html"]:
            self.assertIn(PROJECT + "/" + path, error_page)
        self.assertIn('href="//example.org"', error_page)

    def test_root_site_url_and_existing_extensions_are_preserved(self):
        self.write("about.html", f'<a href="{ORIGINAL}/about.html?mode=1#top">About</a><a href="{ORIGINAL}/not-a-page">Unknown</a><a href="{ORIGINAL}.example.org/about">Unrelated host</a>')
        base = "https://progmetalhero-art.github.io"
        self.build(base + "/")
        about = (self.output / "about.html").read_text()
        self.assertIn(base + "/about.html?mode=1#top", about)
        self.assertIn(base + "/not-a-page", about)
        self.assertIn(ORIGINAL + ".example.org/about", about)
        self.assertIn(f'href="{base}/styles.css"', (self.output / "404.html").read_text())

    def test_source_and_pdf_bytes_are_untouched_and_only_public_inputs_are_copied(self):
        before = self.snapshot(self.source)
        self.build()
        self.assertEqual(self.snapshot(self.source), before)
        self.assertEqual((self.output / "issues/original.pdf").read_bytes(), self.pdf)
        for name in ["script.js", "styles.css", "assets/THIRD-PARTY.md", "assets/vendor/pdfjs/LICENSE", "assets/fonts/sample.woff2", "LICENSE"]:
            self.assertEqual((self.output / name).read_bytes(), (self.source / name).read_bytes())
        for name in ["README.md", "scripts", "tests", ".github", ".git", ".env", "auth.json", ".hidden.txt", "assets/.private"]:
            self.assertFalse((self.output / name).exists(), name)
        self.assertEqual((self.output / ".nojekyll").read_bytes(), b"")

    def test_rejects_checkout_ancestor_and_source_overlap(self):
        before = self.snapshot(self.source)
        unsafe = [self.source, self.source.parent, self.source / "assets", self.source / "assets/new-output",
                  self.source / "issues/new-output", self.source / "articles/new-output", self.source / "index.html"]
        for target in unsafe:
            with self.subTest(target=target), self.assertRaises(builder.BuildError):
                self.build(output=target)
        self.assertEqual(self.snapshot(self.source), before)

    def test_rejects_existing_arbitrary_directories_even_when_empty(self):
        self.output.mkdir()
        with self.assertRaises(builder.BuildError):
            self.build()
        (self.output / "precious.txt").write_text("keep")
        (self.output / builder.MARKER_NAME).write_text("not our marker")
        before = self.snapshot(self.output)
        with self.assertRaises(builder.BuildError):
            self.build()
        self.assertEqual(self.snapshot(self.output), before)

    def test_rejects_symlink_outputs_and_public_symlink_inputs(self):
        target = self.directory / "precious"
        target.mkdir()
        (target / "keep.txt").write_text("keep")
        self.output.symlink_to(target, target_is_directory=True)
        with self.assertRaises(builder.BuildError):
            self.build()
        self.assertEqual((target / "keep.txt").read_text(), "keep")
        self.output.unlink()
        (self.source / "assets/leak.txt").symlink_to(target / "keep.txt")
        with self.assertRaises(builder.BuildError):
            self.build()
        self.assertFalse(self.output.exists())

    def test_owned_output_refresh_removes_stale_files_and_is_reproducible(self):
        self.build()
        first = self.snapshot(self.output)
        (self.output / "stale.html").write_text("old output")
        self.build()
        self.assertEqual(self.snapshot(self.output), first)
        self.assertFalse((self.output / "stale.html").exists())
        self.assertTrue(all(path.stat().st_mtime == 0 for path in self.output.rglob("*") if path.is_file()))

    def test_failed_refresh_preserves_previous_good_output(self):
        self.build()
        before = self.snapshot(self.output)
        self.write("about.html", b"\xff invalid UTF-8")
        with self.assertRaises(UnicodeError):
            self.build()
        self.assertEqual(self.snapshot(self.output), before)

    def test_invalid_base_urls_do_not_create_output(self):
        for value in ["file:///tmp/site", "https://user:secret@example.org", "https://example.org/?query=1",
                      "https://example.org/#fragment", "https://example.org/../escape", 'https://example.org/\"bad']:
            with self.subTest(value=value), self.assertRaises(builder.BuildError):
                self.build(value)
        self.assertFalse(self.output.exists())

    def test_default_output_is_a_separate_generated_directory(self):
        result = builder.build_site(PROJECT, source_root=self.source)
        self.assertEqual(result, self.source / "_site")
        self.assertEqual((result / "issues/original.pdf").read_bytes(), self.pdf)
        self.assertEqual((self.source / "issues/original.pdf").read_bytes(), self.pdf)


if __name__ == "__main__":
    unittest.main()
