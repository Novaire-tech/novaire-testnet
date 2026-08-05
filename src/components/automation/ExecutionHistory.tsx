import { motion } from 'framer-motion';
import { Clock, CheckCircle2, XCircle, ArrowUpRight, Zap } from 'lucide-react';

interface ExecutionHistoryProps {
  upcoming?: any[];
}

const executionHistory: any[] = [];

export function ExecutionHistory({ upcoming = [] }: ExecutionHistoryProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      
      {/* Upcoming Executions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-2xl border border-nova-border bg-white/[0.02] p-6 backdrop-blur-xl"
      >
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10 text-blue-400">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-white">Upcoming Executions</h3>
              <p className="text-sm text-white/50">Scheduled and actively monitoring</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {upcoming.length > 0 ? upcoming.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-xl border border-nova-border bg-white/5 p-4 transition-colors hover:bg-white/10">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white">{item.strategy}</span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/70 uppercase tracking-wider">
                    {item.risk}
                  </span>
                </div>
                <p className="text-sm text-white/50 flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  IF {item.trigger}
                </p>
              </div>
              <div className="text-right flex flex-col items-end gap-1">
                <span className="text-sm font-medium text-orange-400">{item.eta || 'Registered'}</span>
                {item.txHash && (
                  <button className="flex items-center gap-1 text-xs text-white/40 hover:text-blue-400 transition-colors">
                    {item.txHash.slice(0, 8)}...{item.txHash.slice(-4)} <ArrowUpRight className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          )) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-nova-border bg-white/[0.01] py-8 text-center">
              <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-medium text-white/50 mb-3">No active automations</span>
              <p className="text-sm text-white/40">No automation history yet. Create a strategy to begin.</p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Execution History */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="rounded-2xl border border-nova-border bg-white/[0.02] p-6 backdrop-blur-xl"
      >
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-white">Execution History</h3>
              <p className="text-sm text-white/50">Recent automated transactions</p>
            </div>
          </div>
          <button className="text-sm font-medium text-white/50 hover:text-white transition-colors">
            View All
          </button>
        </div>

        <div className="space-y-4">
          {executionHistory.length > 0 ? executionHistory.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-xl border border-nova-border bg-white/5 p-4 transition-colors hover:bg-white/10">
              <div className="flex items-center gap-4">
                {item.status === 'Success' ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <div>
                  <h4 className="font-medium text-white">{item.strategy}</h4>
                  <p className="text-sm text-white/50">{item.action}</p>
                </div>
              </div>
              
              <div className="text-right">
                <div className="text-sm text-white">{item.time}</div>
                <button className="flex items-center justify-end gap-1 text-xs text-white/40 hover:text-blue-400 transition-colors mt-1">
                  {item.hash} <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          )) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-nova-border bg-white/[0.01] py-8 text-center">
              <p className="text-sm text-white/40">No automation history yet.</p>
            </div>
          )}
        </div>
      </motion.div>

    </div>
  );
}
