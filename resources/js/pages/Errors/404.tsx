import { Head, Link } from '@inertiajs/react';
import AdminLayout from '@/layouts/AdminLayout';
import { AlertTriangle } from 'lucide-react';

export default function Error404({ status, message }: { status?: number; message?: string }) {
    return (
        <>
            <Head title="404 - Page Not Found" />

            <div className="flex min-h-[80vh] items-center justify-center bg-gradient-to-b from-gray-50 to-white px-4 sm:px-6 lg:px-8">
                <div className="w-full max-w-lg space-y-8 text-center sm:space-y-10">
                    <div className="flex justify-center">
                        <div className="rounded-full bg-amber-50 p-8 shadow-sm sm:p-10">
                            <AlertTriangle className="h-20 w-20 text-amber-600 sm:h-24 sm:w-24" strokeWidth={1.5} />
                        </div>
                    </div>

                    <h1 className="text-8xl font-extrabold tracking-tight text-amber-600 drop-shadow-sm sm:text-9xl">404</h1>

                    <h2 className="text-4xl font-bold text-gray-900 sm:text-5xl">Page Not Found</h2>

                    <p className="pt-4 text-sm text-gray-500">If you believe this should exist, please contact support.</p>
                </div>
            </div>
        </>
    );
}
