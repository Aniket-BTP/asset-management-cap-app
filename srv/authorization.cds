using { AssetService } from './asset-service';

annotate AssetService.Employees with @restrict: [
  {
    grant : 'READ',
    to    : 'Employee',
    where : (email = $user)
  },
  {
    grant : 'READ',
    to    : ['HRApprover', 'Approver', 'Admin']
  },
  {
    grant : ['CREATE', 'UPDATE', 'DELETE'],
    to    : 'Admin'
  }
];

annotate AssetService.Assets with @restrict: [
  {
    grant : 'READ',
    to    : 'Employee',
    where : (assignedTo.email = $user)
  },
  {
    grant : 'READ',
    to    : ['HRApprover', 'Approver', 'Admin']
  },
  {
    grant : ['CREATE', 'UPDATE', 'DELETE'],
    to    : 'Admin'
  }
];

annotate AssetService.AssetRequests with @restrict: [
  {
    grant : 'READ',
    to    : 'Employee',
    where : (requester.email = $user)
  },
  {
    grant : 'CREATE',
    to    : 'Employee'
  },
  {
    grant : ['UPDATE', 'DELETE', 'submitRequest'],
    to    : 'Employee',
    where : (requester.email = $user and status = 'DRAFT')
  },
  {
    grant : ['READ', 'CREATE', 'UPDATE', 'DELETE', 'submitRequest'],
    to    : 'HRApprover'
  },
  {
    grant : 'READ',
    to    : 'Approver',
    where : (status = 'SUBMITTED')
  },
  {
    grant : ['approveRequest', 'rejectRequest'],
    to    : 'Approver',
    where : (status = 'SUBMITTED')
  },
  {
    grant : '*',
    to    : 'Admin'
  }
];
