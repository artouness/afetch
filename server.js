const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const TurndownService = require("turndown");

const app = express();
const port = 3300;
const turndownService = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-"
});

// Custom Markdown rules
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
    replacement: (content) => content  // Only keep link text, remove URLs
});

turndownService.addRule("images", {
    filter: "img",
    replacement: () => ""  // Remove images completely
});

// Add a custom rule for tables
turndownService.addRule('tables', {
    filter: ['table', 'tr', 'td', 'th'],
    replacement: function(content, node) {
        if (node.nodeName === 'TABLE') {
            return '\n\n' + content + '\n\n';
        }
        if (node.nodeName === 'TR') {
            return '|' + content + '|\n';
        }
        if (node.nodeName === 'TD' || node.nodeName === 'TH') {
            return ' ' + content + ' |';
        }
        return content;
    }
});

function isMainContentContainer(container) {
    return container.attr('id')?.includes('main') || 
           container.attr('class')?.includes('main') ||
           container.attr('role') === 'main' ||
           container.parents('[role="main"]').length > 0;
}

app.get("/", async (req, res) => {
    const url = req.query.url;
    if (!url) {
        return res.status(400).send("Please provide a URL");
    }

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0'
    };

    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
        try {
            const { data } = await axios.get(encodeURI(url), {
                headers,
                maxRedirects: 5,
                timeout: 10000,
                validateStatus: status => status < 500
            });

            if (data) {
                const $ = cheerio.load(data);
                let markdownContent = "";

                // Find all article elements and div.entry-content
                const possibleContainers = $(
                    'article, div.entry-content, div.chakra-stack.css-ar-svx65p, ' +
                    'div.article__content, div.post-body, div.description-article, ' +
                    'div.single-content, div.status-publish hentry, div.pagecontent'
                );
                let mainContainer = null;
                let maxLength = 0;

                // Find the container with the most content
                possibleContainers.each((_, element) => {
                    const container = $(element);
                    // Check if this container has common main content indicators
                    const isMainContent = 
                        container.attr('id')?.includes('main') || 
                        container.attr('class')?.includes('main') ||
                        container.attr('role') === 'main' ||
                        container.parents('[role="main"]').length > 0;

                    const contentLength = container.text().trim().length;
                    
                    // Prioritize containers that have main content indicators
                    // or choose the one with the most content
                    if (isMainContent || contentLength > maxLength) {
                        mainContainer = container;
                        maxLength = contentLength;
                    }
                });

                if (mainContainer) {
                    markdownContent = mainContainer
                        .find('h1, h2, h3, h4, h5, h6, p, ul, ol, li, blockquote, table')
                        .toArray()
                        .reduce((acc, element) => {
                            const $el = $(element);
                            // Remove all img tags completely
                            $el.find('img').remove();
                            // Remove href attributes from links while keeping their text
                            $el.find('a').removeAttr('href');
                            return acc + turndownService.turndown($.html($el)) + "\n\n";
                        }, "");
                }

                if (!markdownContent.trim()) {
                    return res.status(404).send("No main content found.");
                }

                // Display the Markdown file in the browser
                res.setHeader("Content-Disposition", "inline");
                res.setHeader("Content-Type", "text/plain");
                res.send(markdownContent);
            }

            break; // Success, exit the retry loop

        } catch (error) {
            retryCount++;
            console.error(`Attempt ${retryCount}/${maxRetries} failed:`, error.message);

            if (error.response) {
                const status = error.response.status;
                if (status === 403) {
                    return res.status(403).send("Access forbidden. The website might be blocking automated access.");
                } else if (status === 404) {
                    return res.status(404).send("Page not found.");
                }
            }

            if (retryCount === maxRetries) {
                return res.status(500).send(`Failed to fetch the URL after ${maxRetries} attempts. ${error.message}`);
            }

            // Wait before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
        }
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
