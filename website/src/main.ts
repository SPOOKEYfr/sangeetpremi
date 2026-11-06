import './styles.css';
import { renderLayout } from './layout';

renderLayout(document.body.dataset.page ?? 'index.html');
