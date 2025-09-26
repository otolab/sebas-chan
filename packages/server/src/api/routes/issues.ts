import { Router } from 'express';
import { CoreEngine } from '../../core/engine.js';
import { CreateIssueDto, UpdateIssueDto } from '@sebas-chan/shared-types';

export function createIssuesRouter(coreEngine: CoreEngine): Router {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { q } = req.query;
      const issues = q ? await coreEngine.searchIssues(q as string) : [];

      res.json({
        success: true,
        data: issues,
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const issue = await coreEngine.getIssue(req.params.id);
      res.json({
        success: true,
        data: issue,
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const dto: CreateIssueDto = req.body;
      const issue = await coreEngine.createIssue({
        title: dto.title,
        description: dto.description,
        status: 'open',
        labels: dto.labels || [],
        updates: [],
        relations: [],
        sourceInputIds: dto.sourceInputIds || [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      res.status(201).json({
        success: true,
        data: issue,
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const dto: UpdateIssueDto = req.body;
      const issue = await coreEngine.updateIssue(req.params.id, dto);

      res.json({
        success: true,
        data: issue,
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
