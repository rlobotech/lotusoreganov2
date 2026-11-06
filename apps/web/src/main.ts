import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import InventoryLab from './lib/inventory/InventoryLab.svelte';

// `?lab=inventory` opens the inventory sandbox without logging in (development aid).
const lab = new URLSearchParams(location.search).get('lab') === 'inventory';
mount(lab ? InventoryLab : App, { target: document.getElementById('app')! });
