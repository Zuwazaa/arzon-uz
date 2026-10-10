import { loadUser, renderRoute, updateChrome } from './core.js';
import './shop.js';
import './account.js';
import './seller.js';
import './admin.js';
import './motion.js';
import './search.js';

await loadUser().catch(() => {});
updateChrome();
renderRoute();
