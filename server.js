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

function shouldExcludeElement($, element) {
    const classAttr = $(element).attr('class') || '';
    const excludePatterns = [
        'related',
        'sidebar',
        'ad',
        'menu',
        'social',
        'tag',
        'author',
        'share',
        'nav',
        'comment',
        'message-cell--user'
    ];
    
    return excludePatterns.some(pattern => 
        classAttr.toLowerCase().includes(pattern)
    );
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
                let mainContainer = null;

                // First attempt: Look for article or div.entry-content
                mainContainer = $('article, div.entry-content, div.wysiwyg, div.pagecontent, div.chakra-stack.css-ar-1urnsre').first();

                // If not found, look for div with most paragraph content
                if (!mainContainer.length) {
                    let maxParagraphs = 0;
                    $('div').each((_, div) => {
                        const paragraphCount = $(div).find('p').length;
                        if (paragraphCount > maxParagraphs) {
                            maxParagraphs = paragraphCount;
                            mainContainer = $(div);
                        }
                    });
                }

                if (mainContainer.length) {
                    // Remove unwanted elements first
                    mainContainer.find('*').each((_, element) => {
                        if (shouldExcludeElement($, element)) {
                            $(element).remove();
                        }
                    });

                    // Function to check if element has direct text
                    const hasDirectText = (element) => {
                        return $(element).contents().filter((_, content) => 
                            content.nodeType === 3 && content.data.trim().length > 0
                        ).length > 0;
                    };

                    // Collect content
                    markdownContent = mainContainer
                        .find('h1, h2, h3, h4, h5, h6, p, span, li, ol, table, tr, th, td, div')
                        .filter((_, element) => {
                            // Include div only if it has direct text
                            if (element.tagName.toLowerCase() === 'div') {
                                return hasDirectText(element);
                            }
                            return true;
                        })
                        .toArray()
                        .reduce((acc, element) => {
                            const $el = $(element);
                            // Remove images
                            $el.find('img').remove();
                            // Remove link URLs but keep text
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
