import './styles.css';
import { renderLayout } from './layout';
import { renderMarkdown } from './md';
import privacyMd from '../content/PRIVACY.md?raw';
import termsMd from '../content/TERMS.md?raw';

const page = document.body.dataset.page ?? '';
const md = page === 'terms.html' ? termsMd : privacyMd;

renderLayout(page);

const target = document.getElementById('legal-body');
if (target) target.innerHTML = renderMarkdown(md);
