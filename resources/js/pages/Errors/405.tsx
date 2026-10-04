import { Head, Link } from '@inertiajs/react';
import AdminLayout from '@/layouts/AdminLayout';
import { Ban, AlertTriangle } from 'lucide-react'; // Ban icon for "not allowed"

export default function Error405({ status, message }: { status?: number; message?: string }) {
    return (
        <AdminLayout>
            <Head title="405 - Method Not Allowed" />

            <div className="flex min-h-[80vh] items-center justify-center bg-gradient-to-b from-gray-50 to-white px-4 sm:px-6 lg:px-8">
                <div className="w-full max-w-lg space-y-8 text-center sm:space-y-10">
                    {/* Icon */}
                    <div className="flex justify-center">
                        <div className="rounded-full bg-red-50 p-8 shadow-sm sm:p-10">
                            <Ban className="h-20 w-20 text-red-600 sm:h-24 sm:w-24" strokeWidth={1.5} />
                        </div>
                    </div>

                    <h1 className="text-8xl font-extrabold tracking-tight text-red-600 drop-shadow-sm sm:text-9xl">405</h1>

                    <h2 className="text-4xl font-bold text-gray-900 sm:text-5xl">Method Not Allowed</h2>

                    <p className="mx-auto max-w-prose text-lg leading-relaxed text-gray-600 sm:text-xl">
                        {message || "Sorry, this action isn't permitted using the method you tried (e.g. GET instead of POST/PATCH)."}
                    </p>

                    {/* Action Button - consistent with your palette */}
                    <div className="pt-6 sm:pt-8">
                        <Link
                            href="/dashboard"
                            className="inline-flex transform items-center justify-center rounded-xl bg-indigo-600 px-10 py-4 text-lg font-semibold text-white shadow-md transition-all duration-200 hover:scale-105 hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none active:scale-100"
                        >
                            Return to Dashboard
                        </Link>
                    </div>

                    <p className="pt-4 text-sm text-gray-500">Double-check the link or form method. If this keeps happening, contact support.</p>
                </div>
            </div>
        </AdminLayout>
    );
}
