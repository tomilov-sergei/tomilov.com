import tempfile
import unittest
from pathlib import Path

import publish_markdown as markdown


class MarkdownPublicationTests(unittest.TestCase):
    def test_content_keeps_media_links_tables_and_code(self):
        html = """<html><head><title>Site</title></head><body><main>
            <nav><a href="/">Navigation</a></nav>
            <article><h1>Post</h1><p>A <a href="../posts/">link</a> and <strong>a detail</strong>.</p>
            <img src="/image.jpg" alt="Public picture">
            <table><thead><tr><th>One</th><th>Two</th></tr></thead>
            <tbody><tr><td>A</td><td>B | C</td></tr></tbody></table>
            <pre><code>one


two</code></pre><script>boilerplate()</script></article>
            </main></body></html>"""
        output = markdown.render_page(html, "/screenshots/10/")
        self.assertTrue(output.startswith("# Post\n\n"))
        self.assertIn("[link](https://tomilov.com/screenshots/posts/)", output)
        self.assertIn("![Public picture](https://tomilov.com/image.jpg)", output)
        self.assertIn("| One | Two |\n| --- | --- |\n| A | B \\| C |", output)
        self.assertIn("```\none\n\n\ntwo\n```", output)
        self.assertNotIn("boilerplate", output)
        self.assertNotIn("Navigation", output)

    def test_live_update_replaces_the_pair_and_removes_stale_markdown(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            page = root / "screenshots/10/index.html"
            page.parent.mkdir(parents=True)
            source = "<html><head></head><body><main><h1>Post</h1></main></body></html>"
            alternate = page.parent.with_name("10.md")
            markdown.write_page(page, source, root)
            self.assertFalse(alternate.exists())

            (root / markdown.READY).touch()
            markdown.write_page(page, source, root)
            updated = page.read_text().replace("Post", "Updated post")
            markdown.write_page(page, updated, root)
            self.assertEqual(page.read_text().count('type="text/markdown"'), 1)
            self.assertTrue(alternate.read_text().startswith("# Updated post"))

            markdown.remove_page(page.parent, root)
            self.assertFalse(alternate.exists())


if __name__ == "__main__":
    unittest.main()
