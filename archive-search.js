// Loaded only when the visitor opens the assistant. The page is the source of truth.
// Searches existing page content locally without saving visitor queries.
export function createIndex(document) {
  const clean = value => value.replace(/\s+/g, ' ').trim();
  const text = (node, selector) => clean(node.querySelector(selector)?.textContent || '');
  const records = [];
  const collect = (selector, heading, summary, section, keywords) => {
    document.querySelectorAll(selector).forEach(node => {
      const title = text(node, heading);
      const excerpt = text(node, summary);
      const links = [...node.querySelectorAll('a[href]')].map(link => ({
        title: clean(link.textContent).replace(/\s*[↗→]\s*$/, ''), href: link.getAttribute('href')
      })).filter(link => !link.title.includes('LIVE INTERFACE'));
      records.push({ title, excerpt, links, section, keywords });
    });
  };
  collect('.featured-project', 'h3', '.project-problem', '#projects', 'projects websites web development frontend');
  collect('.deployment', 'h4', 'p:not(.project-meta)', '#projects', 'projects websites web development frontend restaurant menu');
  collect('.project-card', 'h3', '.project-problem', '#projects', 'projects tools security code github');
  collect('.writing-item', 'h3', '.writing-summary', '#writing', 'writing notes articles research medium');
  collect('.lab-box', 'h3', '.lab-desc', '#labs', 'labs ctf practice learning machines');
  records.push({ title: 'About Mouhib', excerpt: text(document, '.about-column p'), section: '#about', keywords: 'about who mouhib background learning', links: [] });
  records.push({ title: 'Public directory', excerpt: 'Code, technical writing, and lab profiles.', section: '#contact', keywords: 'contact profiles github medium tryhackme hackthebox social', links: [] });
  const stop = new Set('a an the i me my you your he his is are do does did what which who where how can find show tell about has have built builds'.split(' '));
  const tokens = query => clean(query.toLowerCase()).split(/[^a-z0-9]+/).filter(word => word && !stop.has(word));
  const append = (parent, tag, content, className) => {
    const element = document.createElement(tag);
    element.textContent = content;
    if (className) element.className = className;
    parent.append(element);
    return element;
  };
  return {
    reply(query, log) {
      const question = append(log, 'div', '', 'assistant-message assistant-question');
      append(question, 'p', 'YOU', 'assistant-label');
      append(question, 'p', query);
      const answer = append(log, 'div', '', 'assistant-message');
      append(answer, 'p', 'ARCHIVE', 'assistant-label');
      const words = tokens(query);
      if (/\bwho\b.*\b(mouhib|he)\b/i.test(query)) words.push('background');
      const matches = records.map(record => {
        const titleWords = tokens(record.title);
        const contentWords = tokens(`${record.excerpt} ${record.keywords}`);
        const score = words.reduce((sum, word) => sum + (titleWords.includes(word) ? 5 : contentWords.includes(word) ? 1 : 0), 0);
        return { ...record, score };
      }).filter(record => record.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
      append(answer, 'p', matches.length ? 'Here are matching entries from the archive:' : 'I couldn’t find an entry for that. Try a project name, “privacy”, “websites”, “writing”, or “labs”.');
      matches.forEach(record => {
        const result = append(answer, 'div', '', 'assistant-result');
        append(result, 'h3', record.title);
        append(result, 'p', record.excerpt);
        // Every destination comes from the static document; never from user input.
        const links = record.links.length ? record.links.slice(0, 2) : [{ title: 'Open section', href: record.section }];
        links.forEach(({ title, href }) => {
          if (!href.startsWith('#') && !href.startsWith('https://')) return;
          const link = append(result, 'a', `${title} ↗`);
          link.href = href;
          if (href.startsWith('https://')) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
        });
      });
      // Keep the optional interface bounded during long sessions.
      while (log.children.length > 21) log.firstElementChild.remove();
      log.scrollTop = log.scrollHeight;
    }
  };
}
