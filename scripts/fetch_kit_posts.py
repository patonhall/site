#!/usr/bin/env python3
"""Fetch the mailing list archive from patonhall.kit.com into a data file.

Run by .github/workflows/kit-posts.yml. Writes assets/data/kit-posts.json,
which assets/js/kit-posts.js reads at page load like every other data file
on this site.

Why build time rather than the browser: Kit serves the profile page with
TWO `Access-Control-Allow-Origin: *` headers. curl accepts that, but the
CORS spec allows exactly one and browsers reject the response outright, so
a client-side fetch can never work no matter how the request is shaped.
Fetching here also means a Kit change breaks a workflow run we can see,
instead of failing silently in a visitor's browser, and the visitor gets a
local file (~60ms) instead of a cross-origin round trip.

Kit publishes no RSS feed and no public JSON for a creator profile, so the
source is `window.__PROPS__`, the page's own embedded state, which carries
`recentPosts` with title, metaDescription, thumbnailUrl and url. That blob
is internal and undocumented: it can be reshaped by any Kit deploy. This
script therefore exits non-zero with a clear message rather than writing a
partial file, so the workflow fails loudly and the site keeps serving the
last good data.

Standard library only, matching scripts/approve_request.py.
"""

import json
import os
import sys
import urllib.request

PROFILE_URL = 'https://patonhall.kit.com/'
MARKER = 'window.__PROPS__ ='
OUT_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), '..',
    'assets', 'data', 'kit-posts.json')

# Only these reach the page. Everything else in Kit's blob (campaignId,
# publicationId, isPaid...) is internal and would be noise in the repo.
FIELDS = ('title', 'url', 'publishedAt', 'metaDescription',
          'introContent', 'thumbnailUrl', 'thumbnailAlt')


def extract_props(html):
    """Brace-match the object literal after MARKER.

    A regex cannot do this: post content contains braces, so a non-greedy
    match truncates the JSON and a greedy one overshoots into the rest of
    the page. Tracks string state and escapes so braces inside post text
    are ignored.
    """
    i = html.find(MARKER)
    if i == -1:
        return None
    depth, start, in_string, escaped = 0, None, False, False
    for j in range(i + len(MARKER), len(html)):
        c = html[j]
        if in_string:
            if escaped:
                escaped = False
            elif c == '\\':
                escaped = True
            elif c == '"':
                in_string = False
            continue
        if c == '"':
            in_string = True
        elif c == '{':
            if depth == 0:
                start = j
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(html[start:j + 1])
                except ValueError:
                    return None
    return None


def safe_url(value):
    """Only http(s) survives. These strings become href and src attributes
    on the page, so javascript:, data: and protocol-relative URLs must not
    pass — same guard the client applies."""
    if not isinstance(value, str):
        return None
    return value if value.lower().startswith(('http://', 'https://')) else None


def clean(post):
    out = {k: post.get(k) for k in FIELDS if post.get(k)}
    out['url'] = safe_url(post.get('url'))
    thumb = safe_url(post.get('thumbnailUrl'))
    if thumb:
        out['thumbnailUrl'] = thumb
    else:
        out.pop('thumbnailUrl', None)
        out.pop('thumbnailAlt', None)
    return out


def main():
    request = urllib.request.Request(
        PROFILE_URL, headers={'User-Agent': 'patonhall-site-build'})
    with urllib.request.urlopen(request, timeout=30) as response:
        html = response.read().decode('utf-8', 'replace')

    props = extract_props(html)
    if props is None:
        raise SystemExit(
            'fetch_kit_posts: could not parse window.__PROPS__ from %s — Kit '
            'has probably changed its page structure. Not writing a partial '
            'file; the site keeps serving the last good data.' % PROFILE_URL)

    recent = props.get('recentPosts')
    if not isinstance(recent, list):
        raise SystemExit(
            'fetch_kit_posts: window.__PROPS__ has no recentPosts list — Kit '
            'has probably changed its page structure.')

    posts = [clean(p) for p in recent
             if isinstance(p, dict) and p.get('title') and safe_url(p.get('url'))]

    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(posts, f, indent=2)
        f.write('\n')

    print('fetch_kit_posts: wrote %d post(s)' % len(posts))
    if props.get('hasMore'):
        print('fetch_kit_posts: note — Kit reports hasMore, so only the first '
              'page of posts is included.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
