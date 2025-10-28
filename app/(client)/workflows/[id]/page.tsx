interface WorkflowDetailPageProps {
  params: {
    id: string;
  };
}

export default function WorkflowDetailPage({ params }: WorkflowDetailPageProps) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Workflow {params.id}</h1>
      <p className="text-sm text-muted-foreground">
        Workflow details and run controls will go here.
      </p>
    </div>
  );
}
