import { OverviewCards } from "@/components/dashboard/overview-cards";
import { ExecutionsChart } from "@/components/dashboard/executions-chart";
import { TopWorkflows } from "@/components/dashboard/top-workflows";
import { RecentExecutions } from "@/components/dashboard/recent-executions";
import { TopClients } from "@/components/dashboard/top-clients";

export default function AdminOverviewPage() {
  return (
    <>
      <OverviewCards />
      <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @4xl/main:grid-cols-3">
        <div className="@container/left col-span-2">
          <ExecutionsChart />
        </div>
        <div className="col-span-1">
          <TopWorkflows />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @4xl/main:grid-cols-3">
        <div className="col-span-2">
          <RecentExecutions />
        </div>
        <div className="col-span-1">
          <TopClients />
        </div>
      </div>
    </>
  );
}
