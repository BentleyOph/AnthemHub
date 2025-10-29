interface WorkflowDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function WorkflowDetailPage({ params }: WorkflowDetailPageProps) {
  const { id } = await params;

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Workflow {id}</h1>
      <p className="text-sm text-muted-foreground">
        Workflow details and run controls will go here.
      </p>
    </div>
  );
}
