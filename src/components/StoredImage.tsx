import { useQuery } from "@tanstack/react-query";
import { getSignedUrl, type BucketName } from "@/lib/storage";
import { cn } from "@/lib/utils";

export function StoredImage({
  bucket,
  path,
  alt,
  className,
  fallback,
}: {
  bucket: BucketName;
  path: string | null;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
}) {
  const { data } = useQuery({
    queryKey: ["signed", bucket, path],
    queryFn: () => getSignedUrl(bucket, path),
    enabled: !!path,
    staleTime: 1000 * 60 * 60 * 4,
  });

  if (!path || !data) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-secondary text-muted-foreground text-xs",
          className,
        )}
      >
        {fallback ?? "sem foto"}
      </div>
    );
  }
  return <img src={data} alt={alt} loading="lazy" className={cn("object-cover", className)} />;
}
