interface VerifyBadgeProps {
  txHash: string | null;
}

export default function VerifyBadge({ txHash }: VerifyBadgeProps) {
  if (txHash) {
    return (
      <a
        href={`https://explorer.opengradient.ai/tx/${txHash}`}
        target="_blank"
        rel="noopener noreferrer"
        title={`On-chain proof: ${txHash}`}
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 hover:bg-green-200 no-underline"
      >
        <svg
          className="w-3 h-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
        Verified
      </a>
    );
  }

  return (
    <span
      title="Processed in TEE -- on-chain proof pending"
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500"
    >
      TEE
    </span>
  );
}
