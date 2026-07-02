// eslint-disable-next-line no-unused-vars
import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from '../store/AppContext';
import TabBar from './TabBar';
import Dashboard from '../pages/Dashboard';
import MyCause from '../pages/MyCause';
import Activity from '../pages/Activity';
import Share from '../pages/Share';
import Settings from '../pages/Settings';

const PAGES = {
  dashboard: Dashboard,
  mycause: MyCause,
  activity: Activity,
  share: Share,
  settings: Settings,
};

export default function AppShell() {
  const { tab } = useApp();
  const Page = PAGES[tab] || Dashboard;

  return (
    <div className="w-full h-full relative bg-gray-50 overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0"
        >
          <Page />
        </motion.div>
      </AnimatePresence>
      <TabBar />
    </div>
  );
}
