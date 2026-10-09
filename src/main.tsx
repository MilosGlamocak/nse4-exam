import { render } from 'preact';
import './styles.css';
import { App } from './App';
import { boot } from './store';

render(<App />, document.getElementById('app')!);
void boot();
