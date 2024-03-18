import { Feed } from "feed";
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { parse } from 'node-html-parser';

type ConfigType = {
    sites: SiteType[];
    userAgent: string;
}

type SiteType = {
    url: string;
    name: string;
}

if (!existsSync('config.json')) {
    console.error('No config.json found');
    process.exit(1);
}
const config: ConfigType = JSON.parse(readFileSync('config.json').toString());



type MapType = {
    [key: string]: string;
};

const MapEnglishFrenchMonths: MapType = {
    "janvier": "January",
    "février": "February",
    "mars": "March",
    "avril": "April",
    "mai": "May",
    "juin": "June",
    "juillet": "July",
    "août": "August",
    "septembre": "September",
    "octobre": "October",
    "novembre": "November",
    "décembre": "December"
}

for (const {name, url} of config.sites) {
    console.log(`Processing ${name}...`);
    // fetch the page
    const response = await fetch(url, {
        headers: {
            'User-Agent': config.userAgent
        }
    });

    if (!response.ok) {
        console.error(`Error fetching ${name}`);
        process.exit(1);
    }

    const text = await response.text();
    const root = parse(text);

    const blogInfo = root.getElementsByTagName('script').find((s) => s.text.includes('dataLayer = [{'))?.text;

    if (!blogInfo) {
        console.error('No blog info found');
        process.exit(1);
    }
    // safely parse the blog info json
    const blogInfoJson = blogInfo.replace('dataLayer = ', '').replace(';', '').replace(/'/g, '"').replace(`"adblock"  : "__ads_loaded__" in window ? "No" : "Yes",`, '')
        .replace('\n},\n', '\n}')

    const blogInfoParsed = JSON.parse(blogInfoJson);

    const blogTitle = blogInfoParsed[0].blog_name;
    const blogLanguage = blogInfoParsed[0].lang;
    const description = root.querySelector('meta[name="description"]')?.getAttribute('content');
    const author = root.querySelector('meta[name="author"]')?.getAttribute('content');
    const image = root.querySelector('meta[property="og:image"]')?.getAttribute('content');
    const favicon = root.querySelector('link[rel="icon"]')?.getAttribute('href');
    const link = root.querySelector('.header_link')?.getAttribute('href');

    const feed = new Feed({
        title: blogTitle,
        description: description,
        id: link || '',
        link,
        language: blogLanguage, // optional, used only in RSS 2.0, possible values: http://www.w3.org/TR/REC-html40/struct/dirlang.html#langcodes
        image,
        favicon,
        generator: "awesome", // optional, default = 'Feed for Node.js'
        copyright: "",
        author: {
            name: author,
        }
    });



    // ARTICLES

    // articles have a class of "article"
    const articles = root.querySelectorAll('.article');

    const authorRegexp = /Posté par (.*) à/;
    const dateRegexp = /à (.*) -/;

    for (const article of articles) {
        const title = article.querySelector('h2')?.text;
        const content = article.querySelector('.ob-sections')?.innerHTML;

        // author and date
        const footerInfoText = article.querySelector('.article_footer_info')?.text;

        const match = footerInfoText?.match(authorRegexp);
        const author = match ? match[1] : null;

        const dateMatch = footerInfoText?.match(dateRegexp);
        const hour = dateMatch ? dateMatch[1] : null;

        let day = article.querySelector('.date-header')?.text;
        // change the month from french to english  
        day = day?.replace(/(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)/, (match) => MapEnglishFrenchMonths[match]);
        const date = new Date(`${day} ${hour}`);

        const url = article.querySelector('a.article_link')?.getAttribute('href');

        const img = article.querySelector('img')?.getAttribute('src');


        if (!title || !content || !date || !author || !url) {
            continue;
        }

        feed.addItem({
            title: title,
            id: url,
            link: url,
            description: description,
            content: content,
            author: [
                {
                    name: author,
                }
            ],
            date,
            image: img
        });
        console.log(title, date, author, url);
    }


    // write the feed to a file
    writeFileSync(`feed-${name}.xml`, feed.atom1());
}