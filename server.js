const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const TurndownService = require("turndown");

const app = express();
const port = 3000;
const turndownService = new TurndownService({
    headingStyle: "atx", // Converts <h1> to # Heading
    bulletListMarker: "-" // Uses '-' for unordered lists instead of '*'
});

// Main content selectors (for different websites)
const contentSelectors = [
    "article",
    "div.post-content", "div.entry-content", "div.article-content", "div.jeg_inner_content",
    "div.main-content", "div.content-body", "div.post-body"
];

// Unwanted elements (ads, comments, sidebars, etc.)
const unwantedSelectors = [
    "script", "style", "aside", ".sidebar", ".related-articles", ".jeg_breadcrumbs", ".jeg_meta_container", ".jeg_share_top_container", ".ads_code",
    ".jeg_share_bottom_container", ".jnews_content_bottom_ads", ".jnews_related_post_container", ".jnews_comment_container",
    ".comments", ".share-buttons", ".ads"
];

// Custom rules for better Markdown formatting
turndownService.addRule("strong", {
    filter: ["strong", "b"],
    replacement: (content) => `**${content}**`
});

turndownService.addRule("em", {
    filter: ["em", "i"],
    replacement: (content) => `*${content}*`
});

turndownService.addRule("links", {
    filter: "a",
    replacement: (content, node) => {
        const href = node.getAttribute("href");
        return href ? `[${content}](${href})` : content;
    }
});

turndownService.addRule("images", {
    filter: "img",
    replacement: (content, node) => {
        const src = node.getAttribute("src");
        const alt = node.getAttribute("alt") || "image";
        return src ? `![${alt}](${src})` : "";
    }
});

app.get("/", async (req, res) => {
    const url = req.query.url;
    if (!url) {
        return res.status(400).send("Please provide a URL as ?url=yourpage.com");
    }

    try {
        // Fetch the webpage content
        const { data } = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
            },
            maxRedirects: 5
        });

        const $ = cheerio.load(data);

        // Try to find the main content
        let articleHtml = "";
        for (const selector of contentSelectors) {
            articleHtml = $(selector).first().html();
            if (articleHtml) break;
        }

        if (!articleHtml) {
            return res.status(404).send("Main content not found.");
        }

        // Remove unwanted elements
        unwantedSelectors.forEach((selector) => $(selector).remove());

        // Convert to Markdown
        const markdown = turndownService.turndown(articleHtml);

        // Display the Markdown file in the browser
        res.setHeader("Content-Disposition", "inline");
        res.setHeader("Content-Type", "text/plain");
        res.send(markdown);
    } catch (error) {
        console.error("Error:", error.message);
        return res.status(500).send("Failed to fetch or process the URL.");
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
