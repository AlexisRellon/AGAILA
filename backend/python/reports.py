"""
PDF Report Generation Endpoint

This module provides FastAPI endpoints for generating PDF hazard reports.
Uses ReportLab to create professional PDF documents with map screenshots,
hazard data tables, and metadata.

Module: RG-02 (Report Generation Backend)
Change: add-advanced-map-features (Phase 4)

Dependencies:
- reportlab: PDF generation
- Pillow (PIL): Image processing
- FastAPI: Web framework
- Pydantic: Data validation
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Request, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from pathlib import Path
import tempfile
import io
import base64

from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.units import inch, cm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, 
    Paragraph, 
    Spacer, 
    Table, 
    TableStyle,
    Image as RLImage,
    PageBreak,
    KeepTogether
)
from reportlab.pdfgen import canvas
from PIL import Image
import os
import logging

from backend.python.middleware.rbac import get_current_user_optional, UserContext, UserRole, UserStatus, log_admin_action
from backend.python.middleware.activity_logger import ActivityLogger

logger = logging.getLogger(__name__)

# Router prefix: main.py adds /api/v1, so this becomes /api/v1/reports
router = APIRouter(prefix="/reports", tags=["reports"])
global_img_path = Path(__file__).parent / 'assets' / 'img' / 'GAIA.png'

# ============================================================================
# DATA MODELS
# ============================================================================

class HazardData(BaseModel):
    """Hazard information for PDF report"""
    id: str
    hazard_type: str
    severity: Optional[str] = None  # Severity may be NULL for some hazards
    location_name: str
    latitude: float
    longitude: float
    confidence_score: float
    source_type: str
    created_at: str
    source_content: Optional[str] = None

class ReportMetadata(BaseModel):
    """Report metadata and configuration"""
    title: str = Field(default="GAIA Hazard Report")
    generated_by: str = Field(default="GAIA System")
    time_range: Optional[str] = None
    filter_summary: Optional[str] = None
    total_hazards: int = 0
    page_size: str = Field(default="letter", description="letter or A4")

class ReportRequest(BaseModel):
    """Request model for PDF generation"""
    hazards: List[HazardData]
    metadata: ReportMetadata
    map_screenshot_base64: Optional[str] = None

# ============================================================================
# PDF GENERATION FUNCTIONS
# ============================================================================

def create_header_footer(canvas_obj, doc):
    """
    Add header and footer to each page
    
    Args:
        canvas_obj: ReportLab canvas object
        doc: Document template
    """
    canvas_obj.saveState()
    
    global global_img_path

    # Try to add logo in header
    try:
        if global_img_path.exists():
            canvas_obj.drawImage(str(global_img_path), 0.5*inch, doc.height + doc.topMargin - 0.6*inch, 
                               width=0.5*inch, height=0.5*inch, preserveAspectRatio=True, mask='auto')
            # Text next to logo
            canvas_obj.setFont('Helvetica-Bold', 12)
            canvas_obj.setFillColor(colors.HexColor('#0a2a4d'))
            canvas_obj.drawString(1.1*inch, doc.height + doc.topMargin - 0.35*inch, "GAIA")
            
            canvas_obj.setFont('Helvetica', 8)
            canvas_obj.setFillColor(colors.grey)
            canvas_obj.drawString(1.1*inch, doc.height + doc.topMargin - 0.5*inch, "Geospatial AI-driven Assessment")
        else:
            # Fallback without logo
            canvas_obj.setFont('Helvetica-Bold', 12)
            canvas_obj.setFillColor(colors.HexColor('#0a2a4d'))
            canvas_obj.drawString(0.75*inch, doc.height + doc.topMargin - 0.35*inch, "GAIA")
            
            canvas_obj.setFont('Helvetica', 8)
            canvas_obj.setFillColor(colors.grey)
            canvas_obj.drawString(0.75*inch, doc.height + doc.topMargin - 0.5*inch, "Geospatial AI-driven Assessment")
    except Exception as e:
        # Fallback without logo
        canvas_obj.setFont('Helvetica-Bold', 12)
        canvas_obj.setFillColor(colors.HexColor('#0a2a4d'))
        canvas_obj.drawString(0.75*inch, doc.height + doc.topMargin - 0.35*inch, "GAIA")
        
        canvas_obj.setFont('Helvetica', 8)
        canvas_obj.setFillColor(colors.grey)
        canvas_obj.drawString(0.75*inch, doc.height + doc.topMargin - 0.5*inch, "Geospatial AI-driven Assessment")
    
    # Footer
    canvas_obj.setFont('Helvetica', 8)
    canvas_obj.setFillColor(colors.grey)
    page_num = canvas_obj.getPageNumber()
    footer_text = f"Page {page_num} | Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    canvas_obj.drawRightString(
        doc.width + doc.leftMargin, 
        0.4*inch, 
        footer_text
    )
    
    canvas_obj.restoreState()

def decode_base64_image(base64_string: str) -> io.BytesIO:
    """
    Decode base64 image string to BytesIO object
    
    Args:
        base64_string: Base64 encoded image (with or without data URL prefix)
    
    Returns:
        BytesIO object containing image data
    """
    # Remove data URL prefix if present
    if ',' in base64_string:
        base64_string = base64_string.split(',')[1]
    
    # Decode base64
    image_data = base64.b64decode(base64_string)
    return io.BytesIO(image_data)

def create_hazard_table(hazards: List[HazardData], styles) -> Table:
    """
    Create formatted table of hazards
    
    Args:
        hazards: List of hazard data
        styles: ReportLab styles
    
    Returns:
        Table object with hazard data
    """
    # Table data with headers
    table_data = [[
        Paragraph("<b>Type</b>", styles['Normal']),
        Paragraph("<b>Severity</b>", styles['Normal']),
        Paragraph("<b>Location</b>", styles['Normal']),
        Paragraph("<b>Confidence</b>", styles['Normal']),
        Paragraph("<b>Source</b>", styles['Normal']),
        Paragraph("<b>Date</b>", styles['Normal']),
    ]]
    
    # Add hazard rows
    for hazard in hazards:
        # Format hazard type (remove underscores, capitalize)
        hazard_type = hazard.hazard_type.replace('_', ' ').title()
        
        # Format date
        try:
            date_obj = datetime.fromisoformat(hazard.created_at.replace('Z', '+00:00'))
            date_str = date_obj.strftime('%Y-%m-%d %H:%M')
        except:
            date_str = hazard.created_at[:16]
        
        # Format confidence as percentage
        confidence_str = f"{int(hazard.confidence_score * 100)}%"
        
        # Format source type
        source_str = hazard.source_type.replace('_', ' ').title()
        
        # Format severity (handle None)
        severity_str = hazard.severity.upper() if hazard.severity else 'UNKNOWN'
        
        table_data.append([
            Paragraph(hazard_type, styles['Normal']),
            Paragraph(severity_str, styles['Normal']),
            Paragraph(hazard.location_name, styles['Normal']),
            Paragraph(confidence_str, styles['Normal']),
            Paragraph(source_str, styles['Normal']),
            Paragraph(date_str, styles['Normal']),
        ])
    
    # Create table
    table = Table(table_data, colWidths=[1.2*inch, 0.9*inch, 1.8*inch, 0.8*inch, 1.2*inch, 1.1*inch])
    
    # Style table with better contrast
    table.setStyle(TableStyle([
        # Header row - lighter blue for better contrast
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3b82f6')),  # Lighter blue
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        
        # Data rows
        ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor('#1f2937')),  # Darker text
        ('ALIGN', (0, 1), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('TOPPADDING', (0, 1), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
        ('LEFTPADDING', (0, 1), (-1, -1), 4),
        ('RIGHTPADDING', (0, 1), (-1, -1), 4),
        
        # Alternating row colors - better contrast
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f3f4f6')]),
        
        # Grid
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d1d5db')),  # Lighter grid
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    
    return table

def generate_pdf_report(
    report_request: ReportRequest,
    output_path: Path
) -> None:
    """
    Generate PDF report with hazard data and map screenshot
    
    Args:
        report_request: Report configuration and data
        output_path: Where to save the PDF file
    """
    
    # Determine page size
    page_size = A4 if report_request.metadata.page_size.lower() == 'a4' else letter
    
    # Create PDF document
    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=page_size,
        rightMargin=0.75*inch,
        leftMargin=0.75*inch,
        topMargin=inch,
        bottomMargin=0.75*inch,
    )
    
    # Container for PDF elements
    story = []
    
    # Get styles
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#0a2a4d'),
        spaceAfter=12,
        alignment=1,  # Center
    )
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#0a2a4d'),
        spaceAfter=12,
    )
    
    # ========================================================================
    # TITLE PAGE
    # ========================================================================
    
    # Add GAIA logo at top
    global global_img_path

    story.append(Spacer(1, 0.5*inch))
    if global_img_path.exists():
        try:
            # Center the logo
            logo = RLImage(str(global_img_path), width=1.5*inch, height=1.5*inch, kind='proportional')
            logo.hAlign = 'CENTER'
            story.append(logo)
            story.append(Spacer(1, 0.3*inch))
        except Exception as e:
            print(f"Warning: Could not load logo: {e}")
            print(f"Logo path attempted: {global_img_path}")
            story.append(Spacer(1, 0.5*inch))
    else:
        print(f"Logo file not found at: {global_img_path}")
        story.append(Spacer(1, 0.5*inch))
    
    story.append(Paragraph(report_request.metadata.title, title_style))
    story.append(Spacer(1, 0.2*inch))
    
    # Metadata with better formatting
    metadata_style = ParagraphStyle(
        'Metadata',
        parent=styles['Normal'],
        fontSize=11,
        alignment=1,  # Center
        spaceAfter=6,
    )
    story.append(Paragraph(f"<b>Generated:</b> {datetime.now().strftime('%B %d, %Y at %I:%M %p')}", metadata_style))
    story.append(Paragraph(f"<b>Generated by:</b> {report_request.metadata.generated_by}", metadata_style))
    story.append(Paragraph(f"<b>Total Hazards:</b> {report_request.metadata.total_hazards}", metadata_style))
    story.append(Spacer(1, 0.3*inch))
    
    # Filter summary if provided
    if report_request.metadata.filter_summary:
        story.append(Paragraph("<b>Active Filters:</b>", styles['Normal']))
        story.append(Paragraph(report_request.metadata.filter_summary, styles['Normal']))
        story.append(Spacer(1, 0.3*inch))
    
    # Time range if provided
    if report_request.metadata.time_range:
        story.append(Paragraph(f"<b>Time Range:</b> {report_request.metadata.time_range}", styles['Normal']))
    
    story.append(PageBreak())
    
    # ========================================================================
    # MAP SCREENSHOT
    # ========================================================================
    
    if report_request.map_screenshot_base64:
        story.append(Spacer(1, 0.3*inch))  
        story.append(Paragraph("Map Overview", heading_style))
        story.append(Spacer(1, 0.3*inch))  
        
        try:
            # Decode base64 image
            image_io = decode_base64_image(report_request.map_screenshot_base64)
            
            # Open with PIL to get dimensions
            pil_image = Image.open(image_io)
            img_width, img_height = pil_image.size
            
            # Calculate scaled dimensions to fit page
            max_width = doc.width
            max_height = 5*inch
            aspect = img_height / float(img_width)
            
            if img_width > max_width:
                img_width = max_width
                img_height = img_width * aspect
            
            if img_height > max_height:
                img_height = max_height
                img_width = img_height / aspect
            
            # Reset BytesIO position
            image_io.seek(0)
            
            # Add image to PDF
            rl_image = RLImage(image_io, width=img_width, height=img_height)
            story.append(rl_image)
            story.append(Spacer(1, 0.3*inch))
            
        except Exception as e:
            print(f"Failed to add map screenshot: {e}")
            story.append(Paragraph(
                "<i>Map screenshot could not be included</i>", 
                styles['Italic']
            ))
    
    story.append(PageBreak())
    
    # ========================================================================
    # HAZARD DATA TABLE
    # ========================================================================
    story.append(Spacer(1, 0.3*inch))  
    story.append(Paragraph("Hazard Details", heading_style))
    story.append(Spacer(1, 0.2*inch))
    
    if report_request.hazards:
        hazard_table = create_hazard_table(report_request.hazards, styles)
        story.append(hazard_table)
    else:
        story.append(Paragraph("<i>No hazards to display</i>", styles['Italic']))
    
    story.append(Spacer(1, 0.5*inch))
    
    # ========================================================================
    # SUMMARY STATISTICS
    # ========================================================================
    
    if report_request.hazards:
        story.append(PageBreak())
        story.append(Spacer(1, 0.3*inch))  
        story.append(Paragraph("Summary Statistics", heading_style))
        story.append(Spacer(1, 0.2*inch))
        
        # Count by type
        type_counts = {}
        severity_counts = {}
        source_counts = {}
        
        for hazard in report_request.hazards:
            # Type
            hazard_type = hazard.hazard_type.replace('_', ' ').title()
            type_counts[hazard_type] = type_counts.get(hazard_type, 0) + 1
            
            # Severity (handle None)
            severity = hazard.severity.upper() if hazard.severity else 'UNKNOWN'
            severity_counts[severity] = severity_counts.get(severity, 0) + 1
            
            # Source
            source = hazard.source_type.replace('_', ' ').title()
            source_counts[source] = source_counts.get(source, 0) + 1
        
        # Create summary text
        summary_text = "<b>By Hazard Type:</b><br/>"
        for hazard_type, count in sorted(type_counts.items(), key=lambda x: x[1], reverse=True):
            summary_text += f"• {hazard_type}: {count}<br/>"
        
        summary_text += "<br/><b>By Severity:</b><br/>"
        for severity, count in sorted(severity_counts.items()):
            summary_text += f"• {severity}: {count}<br/>"
        
        summary_text += "<br/><b>By Source:</b><br/>"
        for source, count in sorted(source_counts.items()):
            summary_text += f"• {source}: {count}<br/>"
        
        story.append(Paragraph(summary_text, styles['Normal']))
    
    # ========================================================================
    # BUILD PDF
    # ========================================================================
    
    doc.build(story, onFirstPage=create_header_footer, onLaterPages=create_header_footer)

# ============================================================================
# API ENDPOINTS
# ============================================================================

@router.post("/generate", response_class=FileResponse)
async def generate_report(
    report_request: ReportRequest,
    request: Request,
    current_user: Optional[UserContext] = Depends(get_current_user_optional),
):
    """
    Generate PDF hazard report
    
    Request body should contain:
    - hazards: List of hazard data
    - metadata: Report configuration
    - map_screenshot_base64: Optional base64-encoded map screenshot
    
    Returns:
        FileResponse with generated PDF
    """
    try:
        # Create temporary file for PDF
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp_file:
            output_path = Path(tmp_file.name)
        
        # Generate PDF
        generate_pdf_report(report_request, output_path)
        
        # Log activity: who generated/printed the report (FP-04 Activity Monitor)
        try:
            await ActivityLogger.log_activity(
                user_context=current_user,
                action="PRINT_REPORT",
                request=request,
                resource_type="report",
                resource_id=None,
                details={
                    "title": report_request.metadata.title,
                    "generated_by": report_request.metadata.generated_by,
                    "total_hazards": report_request.metadata.total_hazards,
                    "filename": f"gaia_hazard_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf",
                },
            )
        except Exception as log_error:
            logger.warning(f"Failed to log report generation activity: {log_error}")

        # Log to audit_logs for Audit Logs viewer (AC-01)
        try:
            audit_user = current_user or UserContext(
                user_id="00000000-0000-0000-0000-000000000000",
                email="anonymous",
                role=UserRole.CITIZEN,
                status=UserStatus.ACTIVE,
            )
            await log_admin_action(
                user=audit_user,
                action="report_printed",
                action_description=f"Generated PDF report: {report_request.metadata.title} ({report_request.metadata.total_hazards} hazards)",
                resource_type="reports",
                resource_id=None,
                old_values={},
                new_values={
                    "title": report_request.metadata.title,
                    "generated_by": report_request.metadata.generated_by,
                    "total_hazards": report_request.metadata.total_hazards,
                },
                request=request,
                event_type="REPORT_PRINTED",
            )
        except Exception as log_error:
            logger.warning(f"Failed to log audit: {log_error}")
        
        # Return PDF file
        filename = f"gaia_hazard_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        
        return FileResponse(
            path=str(output_path),
            media_type='application/pdf',
            filename=filename,
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"'
            }
        )
        
    except Exception as e:
        print(f"PDF generation error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate PDF report: {str(e)}"
        )

@router.get("/health")
async def health_check():
    """
    Health check endpoint for report generation service
    """
    return {
        "status": "healthy",
        "service": "PDF Report Generation",
        "timestamp": datetime.now().isoformat()
    }
