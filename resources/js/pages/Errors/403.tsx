import { Head } from '@inertiajs/react';
import { ShieldAlert } from 'lucide-react';
import AdminLayout from '@/layouts/AdminLayout';

export default function Error403({ message }: { message?: string }) {
    return (
        <AdminLayout>
            <Head title="403 - Access Denied" />

            <div className="flex min-h-[80vh] items-center justify-center bg-gradient-to-b from-gray-50 to-white px-4 sm:px-6 lg:px-8">
                <div className="w-full max-w-lg space-y-8 text-center">
                    {/* Icon + Status */}
                    <div className="flex justify-center">
                        <div className="rounded-full bg-red-100 p-6">
                            <ShieldAlert className="h-16 w-16 text-red-600" strokeWidth={1.5} />
                        </div>
                    </div>

                    <h1 className="text-8xl font-extrabold tracking-tight text-red-600 drop-shadow-md sm:text-9xl">403</h1>

                    <h2 className="text-4xl font-bold text-gray-900 sm:text-5xl">Access Denied</h2>

                    <p className="text-xl leading-relaxed text-gray-600">{message || "Sorry, you don't have permission to view this page."}</p>
                </div>
            </div>
        </AdminLayout>
    );
}
