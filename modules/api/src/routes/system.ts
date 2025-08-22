import { Router } from 'express';

const router = Router();

/**
 * GET /api/v1/system/record-types
 * Returns available record types with metadata
 */
router.get('/record-types', (req, res) => {
  try {
    const recordTypes = [
      {
        key: 'bylaw',
        label: 'Bylaw',
        description: 'Municipal bylaws and regulations',
        source: 'core',
        priority: 1,
        fields: ['title', 'content', 'status', 'author'],
        validation: ['required_title', 'required_content'],
      },
      {
        key: 'ordinance',
        label: 'Ordinance',
        description: 'Local ordinances and municipal codes',
        source: 'core',
        priority: 2,
        fields: ['title', 'content', 'status', 'author'],
        validation: ['required_title', 'required_content'],
      },
      {
        key: 'policy',
        label: 'Policy',
        description: 'Organizational policies and procedures',
        source: 'core',
        priority: 3,
        fields: ['title', 'content', 'status', 'author'],
        validation: ['required_title', 'required_content'],
      },
      {
        key: 'proclamation',
        label: 'Proclamation',
        description: 'Official proclamations and declarations',
        source: 'core',
        priority: 4,
        fields: ['title', 'content', 'status', 'author'],
        validation: ['required_title', 'required_content'],
      },
      {
        key: 'resolution',
        label: 'Resolution',
        description: 'Resolutions and formal decisions',
        source: 'core',
        priority: 5,
        fields: ['title', 'content', 'status', 'author'],
        validation: ['required_title', 'required_content'],
      },
    ];

    res.json({
      success: true,
      data: {
        record_types: recordTypes,
        total: recordTypes.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch record types',
        code: 'RECORD_TYPES_FETCH_FAILED',
      },
    });
  }
});

/**
 * GET /api/v1/system/record-statuses
 * Returns available record statuses with metadata
 */
router.get('/record-statuses', (req, res) => {
  try {
    const recordStatuses = [
      {
        key: 'draft',
        label: 'Draft',
        description: 'Initial draft status',
        color: 'gray',
        priority: 1,
        transitions: ['proposed', 'archived'],
        editable: true,
      },
      {
        key: 'proposed',
        label: 'Proposed',
        description: 'Proposed for review',
        color: 'blue',
        priority: 2,
        transitions: ['review', 'draft'],
        editable: true,
      },
      {
        key: 'review',
        label: 'Under Review',
        description: 'Currently under review',
        color: 'yellow',
        priority: 3,
        transitions: ['approved', 'rejected', 'proposed'],
        editable: false,
      },
      {
        key: 'approved',
        label: 'Approved',
        description: 'Approved and active',
        color: 'green',
        priority: 4,
        transitions: ['adopted', 'archived'],
        editable: false,
      },
      {
        key: 'rejected',
        label: 'Rejected',
        description: 'Rejected during review',
        color: 'red',
        priority: 5,
        transitions: ['draft', 'archived'],
        editable: true,
      },
      {
        key: 'adopted',
        label: 'Adopted',
        description: 'Formally adopted',
        color: 'green',
        priority: 6,
        transitions: ['archived'],
        editable: false,
      },
      {
        key: 'archived',
        label: 'Archived',
        description: 'Archived and inactive',
        color: 'gray',
        priority: 7,
        transitions: ['draft'],
        editable: false,
      },
    ];

    res.json({
      success: true,
      data: {
        record_statuses: recordStatuses,
        total: recordStatuses.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch record statuses',
        code: 'RECORD_STATUSES_FETCH_FAILED',
      },
    });
  }
});

export default router;
