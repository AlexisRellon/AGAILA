/**
 * Report Confirmation Page
 * Module: CR-07
 * 
 * Displays thank you message and tracking ID after successful submission
 */

import React from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { CheckCircle, Copy, ArrowRight, FileText } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';

/**
 * Render the report submission confirmation view.
 *
 * Displays a thank-you page with the report's tracking ID, copy-to-clipboard action, next-step guidance,
 * and navigation actions. If no `trackingId` is present in route parameters, renders an invalid confirmation
 * message with a link to submit a new report.
 *
 * @returns The confirmation page JSX; if `trackingId` is missing, a fallback invalid-page JSX prompting report submission.
 */
export function ReportConfirmation() {
  const { trackingId } = useParams<{ trackingId: string }>();
  const navigate = useNavigate();
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    if (trackingId) {
      navigator.clipboard.writeText(trackingId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!trackingId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <p className="text-red-600 font-semibold">Invalid confirmation page</p>
          <Link to="/report" className="text-blue-600 hover:text-blue-700 underline mt-4 block">
            Submit a new report
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Success Icon */}
        <div className="flex justify-center mb-8 animate-bounce-slow">
          <div className="relative">
            <CheckCircle className="w-24 h-24 text-green-500" />
            <div className="absolute inset-0 w-24 h-24 bg-green-500 rounded-full opacity-20 animate-ping" />
          </div>
        </div>

        {/* Main Card */}
        <Card className="p-5 sm:p-8 md:p-12 shadow-xl bg-white">
          {/* Thank You Message */}
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Thank You for Your Report!
            </h1>
            <p className="text-lg text-gray-600 mb-2">
              Your hazard report has been successfully submitted and is now pending verification by authorities.
            </p>
            <Badge variant="secondary" className="text-sm">
              Status: Pending Verification
            </Badge>
          </div>

          {/* Tracking ID Section */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6 mb-8">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Your Tracking ID
                </h2>
                <p className="text-xs text-gray-600">
                  Save this ID to check your report status later
                </p>
              </div>
              <FileText className="w-5 h-5 text-blue-600" />
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 min-w-0 overflow-hidden bg-white rounded-lg border-2 border-gray-300 px-4 py-3">
                <code className="text-sm sm:text-lg md:text-xl font-mono font-bold text-gray-900 tracking-wider break-all">
                  {trackingId}
                </code>
              </div>
              <Button
                onClick={handleCopy}
                variant="outline"
                size="lg"
                className="flex-shrink-0"
              >
                <Copy className="w-5 h-5 mr-2" />
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            </div>

            <div className="flex items-start gap-2 text-xs text-gray-600 bg-white rounded-lg p-3 border border-gray-200">
              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />
              <p>
                <strong>Important:</strong> This tracking ID is your only way to check the status of your report. 
                Please save it or take a screenshot for your records.
              </p>
            </div>
          </div>

          {/* What Happens Next Section */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">What Happens Next?</h2>
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-700 font-semibold text-sm">1</span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Initial Review</h3>
                  <p className="text-sm text-gray-600">
                    Your report will be reviewed by authorized validators who will verify the information.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-700 font-semibold text-sm">2</span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Verification Process</h3>
                  <p className="text-sm text-gray-600">
                    Authorities will assess the report&apos;s accuracy and relevance to ongoing hazard monitoring.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-700 font-semibold text-sm">3</span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Status Update</h3>
                  <p className="text-sm text-gray-600">
                    Use your tracking ID to check if your report has been verified and added to the system.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4">
            <Button
              onClick={() => navigate(`/track?id=${trackingId}`)}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              size="lg"
            >
              <FileText className="w-5 h-5 mr-2" />
              Track This Report
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>

            <Button
              onClick={() => navigate('/map')}
              variant="outline"
              className="flex-1"
              size="lg"
            >
              View Hazard Map
            </Button>
          </div>

          {/* Additional Info */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center">
              If you have urgent concerns or need immediate assistance, please contact your local 
              disaster risk reduction office or call the emergency hotline <strong>911</strong>.
            </p>
          </div>
        </Card>

        {/* Bottom Actions */}
        <div className="mt-8 text-center">
          <Link
            to="/report"
            className="text-blue-600 hover:text-blue-700 underline font-medium"
          >
            Submit Another Report
          </Link>
        </div>
      </div>
    </div>
  );
}

export default ReportConfirmation;
